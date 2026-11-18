import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyMySqlConnection } from './config/mysql.js';
import { createMySqlAuthRouter } from './routes/mysqlAuth.js';
import { createMySqlDashboardRouter } from './routes/mysqlDashboards.js';
import { createMySqlReferralRouter } from './routes/mysqlReferrals.js';
import { createMySqlNotificationRouter } from './routes/mysqlNotifications.js';

const app = express();
const frontendDistPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../Frontend/dist'
);
const tokenSecret = process.env.AUTH_TOKEN_SECRET;
if (!tokenSecret || tokenSecret.length < 32) {
  throw new Error('AUTH_TOKEN_SECRET must be set to a random value of at least 32 characters.');
}

const localDevelopmentOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];
const allowedOrigins = [
  ...(process.env.FRONTEND_ORIGINS || '').split(','),
  ...localDevelopmentOrigins,
]
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS.'));
  },
}));
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Safi Sali Companies API' });
});

app.use('/api/mysql-auth', createMySqlAuthRouter(tokenSecret));
app.use('/api/mysql-dashboards', createMySqlDashboardRouter(tokenSecret));
app.use('/api/mysql-referrals', createMySqlReferralRouter(tokenSecret));
app.use('/api/mysql-notifications', createMySqlNotificationRouter(tokenSecret));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});
app.use('/workspace', (_req, res) => {
  res.status(404).json({ error: 'Workspace route not found.' });
});

if (existsSync(path.join(frontendDistPath, 'index.html'))) {
  app.use(express.static(frontendDistPath));
  app.get('*', (req, res, next) => {
    if (
      req.path === '/api' ||
      req.path.startsWith('/api/') ||
      req.path === '/workspace' ||
      req.path.startsWith('/workspace')
    ) {
      return next();
    }
    return res.sendFile(path.join(frontendDistPath, 'index.html'), (error) => {
      if (error) next(error);
    });
  });
}

app.use((error, _req, res, _next) => {
  console.error('API request failed:', error);
  if (res.headersSent) return;
  res.status(500).json({ error: 'The request could not be completed.' });
});

const port = process.env.PORT || 5000;
verifyMySqlConnection()
  .then((database) => {
    console.log(`MySQL connected: ${database.version}`);
    app.listen(port, () => console.log(`SAFI SALI COMPANIES API listening on http://localhost:${port}`));
  })
  .catch((error) => {
    console.error('Startup failed:', error.message);
    process.exit(1);
  });
