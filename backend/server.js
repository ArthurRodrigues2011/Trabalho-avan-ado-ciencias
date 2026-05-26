require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');

const analyticsRoutes = require('./routes/analytics');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.set('trust proxy', true);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    const error = new Error(`Origem bloqueada pelo CORS: ${origin}`);
    error.status = 403;
    callback(error);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token'],
  maxAge: 86400
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '30kb' }));
app.use(express.urlencoded({ extended: false, limit: '30kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'github-pages-analytics',
    timestamp: new Date().toISOString()
  });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.use(express.static(publicDir, {
  extensions: ['html'],
  maxAge: '1h',
  setHeaders(res, filePath) {
    if (filePath.endsWith('tracker.js')) {
      res.setHeader('Cache-Control', 'public, max-age=300');
    }
  }
}));

app.use('/', analyticsRoutes);

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: 'Rota nao encontrada'
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = statusCode === 500 ? 'Erro interno do servidor' : err.message;

  console.error(JSON.stringify({
    level: 'error',
    event: 'request_failed',
    method: req.method,
    path: req.originalUrl,
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    timestamp: new Date().toISOString()
  }));

  res.status(statusCode).json({
    ok: false,
    error: message
  });
});

app.listen(PORT, () => {
  console.log(JSON.stringify({
    level: 'info',
    event: 'server_started',
    port: PORT,
    admin: `http://localhost:${PORT}/admin`,
    timestamp: new Date().toISOString()
  }));
});

module.exports = app;
