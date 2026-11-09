import { execFileSync } from 'node:child_process';
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const owner = process.env.GH_REPO_OWNER ?? '';
const sourceRepository = process.env.GH_SOURCE_REPOSITORY ?? '';
const sourceSha = process.env.GH_SOURCE_SHA ?? '';
const token = process.env.GH_TOKEN ?? '';
const sourceRoot = process.cwd();
const configuredTargetNames = (process.env.SYNC_TARGET_REPOSITORIES ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) {
  throw new Error('GH_REPO_OWNER must be a valid GitHub account or organization name.');
}
if (!new RegExp(`^${owner}/[A-Za-z0-9._-]+$`, 'i').test(sourceRepository)) {
  throw new Error('GH_SOURCE_REPOSITORY must be a repository owned by GH_REPO_OWNER.');
}
if (!/^[a-f0-9]{40,64}$/i.test(sourceSha)) {
  throw new Error('GH_SOURCE_SHA must be a full Git commit SHA.');
}
if (!token) {
  throw new Error('The GitHub App token is missing.');
}
if (targetNames.length === 0) {
  throw new Error('Set SYNC_TARGET_REPOSITORIES to a comma-separated list of repository names.');
}

const sourceName = sourceRepository.split('/')[1];
const targetNames = [
  ...new Map(configuredTargetNames.map((name) => [name.toLowerCase(), name])).values(),
];
const targetRepositories = targetNames.map((name) => {
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name === '.' || name === '..') {
    throw new Error(`Invalid target repository name: ${name}`);
  }
  if (name.toLowerCase() === sourceName.toLowerCase()) {
    throw new Error('The source repository cannot also be a target repository.');
  }
  return `${owner}/${name}`;
});

const gitEnvironment = {
  ...process.env,
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
  GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
  GIT_TERMINAL_PROMPT: '0',
};

function runGit(directory, args) {
  try {
    return execFileSync('git', args, {
      cwd: directory,
      env: gitEnvironment,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const details = error.stderr?.toString().trim();
    throw new Error(`Git ${args[0]} failed${details ? `: ${details}` : '.'}`);
  }
}

async function githubRequest(endpoint, options = {}) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const responseText = await response.text();
  let result;
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(`GitHub returned an unreadable response (${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status}): ${result.message ?? 'Unknown error'}`);
  }
  return result;
}

async function hasOpenSyncPullRequest(repository) {
  for (let page = 1; page <= 20; page += 1) {
    const pulls = await githubRequest(
      `/repos/${repository}/pulls?state=open&per_page=100&page=${page}`
    );
    if (!Array.isArray(pulls)) {
      throw new Error(`GitHub returned an invalid pull request list for ${repository}.`);
    }
    if (pulls.some((pull) => pull.head?.ref?.startsWith('sync/vertex-source/'))) {
      return true;
    }
    if (pulls.length < 100) return false;
  }
  throw new Error(`Could not safely check all open pull requests for ${repository}.`);
}

async function hasPullRequestForBranch(repository, branch) {
  const head = encodeURIComponent(`${owner}:${branch}`);
  const pulls = await githubRequest(
    `/repos/${repository}/pulls?state=all&head=${head}&per_page=100`
  );
  if (!Array.isArray(pulls)) {
    throw new Error(`GitHub returned an invalid pull request list for ${repository}.`);
  }
  return pulls.length > 0;
}

function isSensitivePath(relativePath) {
  const basename = path.posix.basename(relativePath).toLowerCase();
  return (
    basename === '.env' ||
    (basename.startsWith('.env.') && basename !== '.env.example') ||
    basename.endsWith('.env') ||
    [
      '.npmrc',
      '.pypirc',
      'credentials.json',
      'id_rsa',
      'id_ed25519',
      'secret.json',
      'secrets.json',
      'service-account.json',
    ].includes(basename) ||
    /\.(?:pem|key|p12|pfx)$/i.test(basename)
  );
}

function removeSensitiveFiles(directory, relativeDirectory = '') {
  for (const name of readdirSync(directory)) {
    const relativePath = path.posix.join(relativeDirectory, name);
    const fullPath = path.join(directory, name);
    const details = lstatSync(fullPath);
    if (isSensitivePath(relativePath)) {
      rmSync(fullPath, { recursive: details.isDirectory() && !details.isSymbolicLink(), force: true });
    } else if (details.isDirectory() && !details.isSymbolicLink()) {
      removeSensitiveFiles(fullPath, relativePath);
    }
  }
}

async function createUpdatePullRequest(repository, tempRoot, sourceSnapshot) {
  const repoInfo = await githubRequest(`/repos/${repository}`);
  if (repoInfo.private !== true) {
    throw new Error(`${repository} is not private; public targets are not allowed.`);
  }
  if (typeof repoInfo.default_branch !== 'string' || !repoInfo.default_branch) {
    throw new Error(`Could not determine the default branch for ${repository}.`);
  }

  if (await hasOpenSyncPullRequest(repository)) {
    console.log(`Skipping ${repository}: review or close its existing sync pull request first.`);
    return 'skipped';
  }

  const branch = `sync/vertex-source/${sourceSha}`;
  if (await hasPullRequestForBranch(repository, branch)) {
    console.log(`Skipping ${repository}: an update pull request for this source commit already exists.`);
    return 'skipped';
  }

  const targetDirectory = path.join(tempRoot, repoInfo.name);
  runGit(tempRoot, [
    'clone',
    '--depth',
    '1',
    '--branch',
    repoInfo.default_branch,
    `https://github.com/${repository}.git`,
    targetDirectory,
  ]);
  runGit(targetDirectory, ['checkout', '--no-track', '-b', branch]);
  runGit(targetDirectory, ['rm', '-r', '-f', '--ignore-unmatch', '--', '.']);
  cpSync(sourceSnapshot, targetDirectory, { recursive: true });
  runGit(targetDirectory, ['add', '--all']);

  const changedFiles = runGit(targetDirectory, ['diff', '--cached', '--name-only']).trim();
  if (!changedFiles) {
    console.log(`Skipping ${repository}: it already matches the source.`);
    return 'skipped';
  }

  const existingBranch = runGit(
    targetDirectory,
    ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`]
  );
  if (existingBranch?.trim()) {
    throw new Error(
      `${repository} already has branch ${branch} without a matching pull request; inspect it before retrying.`
    );
  }

  runGit(targetDirectory, ['config', 'user.name', 'Safi Sali Companies Sync']);
  runGit(targetDirectory, ['config', 'user.email', 'vertex-tech-sync[bot]@users.noreply.github.com']);
  runGit(targetDirectory, ['commit', '-m', `chore(sync): propose source update ${sourceSha.slice(0, 12)}`]);
  runGit(targetDirectory, ['push', '--set-upstream', 'origin', branch]);

  const pullRequest = await githubRequest(`/repos/${repository}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: `[Safi Sali Companies update] ${sourceSha.slice(0, 12)}`,
      head: branch,
      base: repoInfo.default_branch,
      body: [
        `This pull request mirrors the tracked files from [${sourceRepository}]`,
        `at commit [${sourceSha.slice(0, 12)}](https://github.com/${sourceRepository}/commit/${sourceSha}).`,
        '',
        'Review every changed file, especially deletions, before merging. This workflow does not merge pull requests.',
      ].join('\n'),
    }),
  });

  console.log(`Opened update PR for ${repository}: ${pullRequest.html_url}`);
  return 'created';
}

const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'vertex-repo-sync-'));
try {
  const sourceSnapshot = path.join(tempRoot, 'source');
  const archivePath = path.join(tempRoot, 'source.tar');
  mkdirSync(sourceSnapshot);
  if (runGit(sourceRoot, ['rev-parse', 'HEAD']).trim().toLowerCase() !== sourceSha.toLowerCase()) {
    throw new Error('The checked-out source commit does not match GH_SOURCE_SHA.');
  }
  runGit(sourceRoot, ['archive', '--format=tar', `--output=${archivePath}`, sourceSha]);
  execFileSync('tar', ['-xf', archivePath, '-C', sourceSnapshot], {
    stdio: 'pipe',
  });
  removeSensitiveFiles(sourceSnapshot);

  let created = 0;
  let skipped = 0;
  for (const repository of targetRepositories) {
    const result = await createUpdatePullRequest(repository, tempRoot, sourceSnapshot);
    if (result === 'created') created += 1;
    else skipped += 1;
  }
  console.log(`Finished: ${created} pull request(s) opened; ${skipped} target(s) skipped.`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
