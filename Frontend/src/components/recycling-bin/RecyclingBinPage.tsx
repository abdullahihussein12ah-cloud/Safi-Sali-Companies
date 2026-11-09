import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArchiveRestore, CalendarClock, Edit3, LoaderCircle, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  editRecyclingBinRecord,
  getRecyclingBin,
  getStoredAccessToken,
  permanentlyDeleteRecyclingBinRecords,
  RecyclingBinEntry,
  restoreRecyclingBinRecords,
} from '../../services/api';
import { isBusinessOwnerRole } from '../../services/permissions';

const moduleOptions = [
  'Products',
  'Customers',
  'Suppliers',
  'Categories',
  'Sales & Invoices',
  'Purchases',
  'Customer Ledger',
  'Supplier Ledger',
  'Inventory',
  'Payroll',
  'Attendance',
  'Leave Records',
];

const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const formatRecord = (record: unknown): string => {
  if (typeof record === 'string') return record;
  if (!record || typeof record !== 'object') return String(record ?? '');
  return JSON.stringify(record, null, 2);
};

export const RecyclingBinPage: React.FC = () => {
  const { activeUser, showToast } = useApp();
  const [entries, setEntries] = useState<RecyclingBinEntry[]>([]);
  const [stats, setStats] = useState({ total: 0, recentlyDeleted: 0, restored: 0, permanentlyDeleted: 0 });
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('');
  const [deletedBy, setDeletedBy] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<RecyclingBinEntry | null>(null);
  const [editedRecord, setEditedRecord] = useState('');

  const loadEntries = useCallback(async () => {
    const token = getStoredAccessToken();
    if (!token) throw new Error('Sign in again to access the Recycling Bin.');
    const result = await getRecyclingBin(token, {
      page,
      pageSize: 25,
      search,
      module,
      deletedBy,
      from,
      to,
      sort,
    });
    setEntries(result.entries);
    setStats(result.stats);
    setPageCount(Math.max(1, result.pagination.pageCount));
    setSelectedIds((current) => current.filter((id) => result.entries.some((entry) => entry.id === id)));
  }, [page, search, module, deletedBy, from, to, sort]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    loadEntries()
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'The Recycling Bin could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [loadEntries]);

  const selectedOnPage = useMemo(
    () => entries.length > 0 && entries.every((entry) => selectedIds.includes(entry.id)),
    [entries, selectedIds]
  );
  const canManage = isBusinessOwnerRole(activeUser.role);

  const refresh = async () => {
    setLoading(true);
    try {
      await loadEntries();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The Recycling Bin could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (all = false) => {
    const ids = all ? [] : selectedIds;
    if (!all && ids.length === 0) {
      showToast('Select at least one record to restore.', 'error');
      return;
    }
    if (!window.confirm(all
      ? 'Restore every record in the Recycling Bin?'
      : `Restore ${ids.length} selected record${ids.length === 1 ? '' : 's'}?`)) return;
    const token = getStoredAccessToken();
    if (!token) {
      showToast('Sign in again to restore records.', 'error');
      return;
    }
    setBusy(true);
    try {
      let restored = 0;
      const skipped: Array<{ id: string; reason: string }> = [];
      let result: Awaited<ReturnType<typeof restoreRecyclingBinRecords>>;
      do {
        result = await restoreRecyclingBinRecords(token, ids, all);
        restored += result.restored;
        skipped.push(...result.skipped);
      } while (all && result.hasMore);
      showToast(
        skipped.length
          ? `${restored} restored; ${skipped.length} skipped because the original record already exists.`
          : `${restored} record${restored === 1 ? '' : 's'} restored successfully.`,
        skipped.length ? 'info' : 'success'
      );
      setSelectedIds([]);
      await refresh();
    } catch (restoreError) {
      showToast(restoreError instanceof Error ? restoreError.message : 'Records could not be restored.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handlePermanentDelete = async (all = false) => {
    const ids = all ? [] : selectedIds;
    if (!all && ids.length === 0) {
      showToast('Select at least one record to permanently delete.', 'error');
      return;
    }
    const warning = all
      ? 'Permanently delete every record in the Recycling Bin? This cannot be undone.'
      : `Permanently delete ${ids.length} selected record${ids.length === 1 ? '' : 's'}? This cannot be undone.`;
    if (!window.confirm(warning)) return;
    const token = getStoredAccessToken();
    if (!token) {
      showToast('Sign in again to permanently delete records.', 'error');
      return;
    }
    setBusy(true);
    try {
      let permanentlyDeleted = 0;
      let result: Awaited<ReturnType<typeof permanentlyDeleteRecyclingBinRecords>>;
      do {
        result = await permanentlyDeleteRecyclingBinRecords(token, ids, all);
        permanentlyDeleted += result.permanentlyDeleted;
      } while (all && result.hasMore);
      showToast(`${permanentlyDeleted} record${permanentlyDeleted === 1 ? '' : 's'} permanently deleted.`, 'success');
      setSelectedIds([]);
      await refresh();
    } catch (deleteError) {
      showToast(deleteError instanceof Error ? deleteError.message : 'Records could not be permanently deleted.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const token = getStoredAccessToken();
    if (!token) {
      showToast('Sign in again to edit deleted records.', 'error');
      return;
    }
    let record: unknown;
    try {
      record = JSON.parse(editedRecord);
    } catch {
      showToast('Enter a valid JSON record before saving.', 'error');
      return;
    }
    setBusy(true);
    try {
      await editRecyclingBinRecord(token, editing.id, record);
      showToast('Deleted record updated.', 'success');
      setEditing(null);
      await refresh();
    } catch (editError) {
      showToast(editError instanceof Error ? editError.message : 'The deleted record could not be updated.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) {
    return (
      <section role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
        Administrator access is required to view or manage deleted business records.
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-emerald-900 bg-gradient-to-br from-slate-950 via-emerald-950 to-emerald-800 p-5 text-white shadow-lg sm:rounded-3xl sm:p-7">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-200">
            <ShieldCheck className="h-4 w-4" /> Administrator only
          </div>
          <h1 className="mt-2 text-2xl font-black sm:text-3xl">Recycling Bin</h1>
          <p className="mt-1 max-w-2xl text-sm text-emerald-100">Review, edit, restore, or permanently remove deleted business records.</p>
        </div>
        <button type="button" disabled={loading || busy} onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/15 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      <section aria-label="Recycling Bin statistics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total deleted records', value: stats.total, icon: Trash2 },
          { label: 'Recently deleted (7 days)', value: stats.recentlyDeleted, icon: CalendarClock },
          { label: 'Restored records', value: stats.restored, icon: ArchiveRestore },
          { label: 'Permanently deleted', value: stats.permanentlyDeleted, icon: AlertTriangle },
        ].map(({ label, value, icon: Icon }) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span>{label}</span><Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{value.toLocaleString()}</p>
          </article>
        ))}
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-3xl sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <label className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search record name or ID" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950" />
          </label>
          <select aria-label="Filter by module" value={module} onChange={(event) => { setModule(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950">
            <option value="">All modules</option>
            {moduleOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
          <select aria-label="Filter by deleting user" value={deletedBy} onChange={(event) => { setDeletedBy(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950">
            <option value="">All deleting users</option>
            {Array.from(new Map(entries.map((entry) => [entry.deletedBy, entry.deletedByName])).entries()).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select aria-label="Sort deletion date" value={sort} onChange={(event) => setSort(event.target.value as 'newest' | 'oldest')} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <div className="flex gap-2">
            <input aria-label="Deleted from date" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className="min-w-0 w-1/2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-950" />
            <input aria-label="Deleted to date" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} className="min-w-0 w-1/2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-950" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-slate-100 py-3 dark:border-slate-800">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={selectedOnPage} onChange={(event) => setSelectedIds(event.target.checked ? [...new Set([...selectedIds, ...entries.map((entry) => entry.id)])] : selectedIds.filter((id) => !entries.some((entry) => entry.id === id)))} />
            Select page ({selectedIds.length} selected)
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || loading || selectedIds.length === 0} onClick={() => void handleRestore()} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
              <ArchiveRestore className="h-3.5 w-3.5" /> Restore Selected
            </button>
            <button type="button" disabled={busy || loading || stats.total === 0} onClick={() => void handleRestore(true)} className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-800 dark:border-emerald-800 dark:text-emerald-300 disabled:opacity-50">Restore All</button>
            <button type="button" disabled={busy || loading || selectedIds.length === 0} onClick={() => void handlePermanentDelete()} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
              <Trash2 className="h-3.5 w-3.5" /> Delete Selected
            </button>
            <button type="button" disabled={busy || loading || stats.total === 0} onClick={() => void handlePermanentDelete(true)} className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-bold text-rose-800 dark:border-rose-800 dark:text-rose-300 disabled:opacity-50">Delete All</button>
          </div>
        </div>

        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading deleted records…</div>
        ) : entries.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">The Recycling Bin is empty.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="p-3"></th><th className="p-3">Record / ID</th><th className="p-3">Original module</th><th className="p-3">Deleted by</th><th className="p-3">Deleted date & time</th><th className="p-3">Status</th><th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {entries.map((entry) => (
                  <tr key={entry.id} className="align-top">
                    <td className="p-3"><input type="checkbox" aria-label={`Select ${entry.recordName}`} checked={selectedIds.includes(entry.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, entry.id] : current.filter((id) => id !== entry.id))} /></td>
                    <td className="max-w-56 p-3"><p className="break-words font-bold text-slate-900 dark:text-white">{entry.recordName}</p><p className="mt-1 break-all font-mono text-[10px] text-slate-500">{entry.recordId}</p></td>
                    <td className="p-3">{entry.module}</td>
                    <td className="p-3">{entry.deletedByName}</td>
                    <td className="p-3">{formatDate(entry.deletedAt)}{entry.editedAt && <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">Edited by {entry.editedByName} · {formatDate(entry.editedAt)}</p>}</td>
                    <td className="p-3"><span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">Deleted</span></td>
                    <td className="p-3"><button type="button" disabled={busy} onClick={() => { setEditing(entry); setEditedRecord(formatRecord(entry.record)); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 font-bold hover:border-emerald-500 disabled:opacity-50 dark:border-slate-700"><Edit3 className="h-3.5 w-3.5" /> Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="flex items-center justify-between gap-3 text-xs text-slate-500">
          <span>Page {page} of {pageCount}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-slate-200 px-3 py-2 font-semibold disabled:opacity-40 dark:border-slate-700">Previous</button>
            <button type="button" disabled={page >= pageCount || loading} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-slate-200 px-3 py-2 font-semibold disabled:opacity-40 dark:border-slate-700">Next</button>
          </div>
        </footer>
      </section>

      {editing && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="edit-deleted-title" className="w-full max-w-2xl space-y-4 rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
            <div>
              <h2 id="edit-deleted-title" className="text-lg font-black">Edit deleted record</h2>
              <p className="mt-1 text-xs text-slate-500">{editing.module} · {editing.recordId}. Keep its original record ID to preserve references.</p>
            </div>
            <textarea autoFocus value={editedRecord} onChange={(event) => setEditedRecord(event.target.value)} rows={16} spellCheck={false} aria-label="Deleted record JSON" className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950" />
            <div className="flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setEditing(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold dark:border-slate-700">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void handleSaveEdit()} className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save changes'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
