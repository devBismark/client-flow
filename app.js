const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const projectRoutes = require('./src/routes/projectRoutes');
const diagnosticRoutes = require('./src/routes/diagnosticRoutes');
const radarRoutes = require('./src/routes/radarRoutes');
const radarLeadRoutes = require('./src/routes/radarLeadRoutes');
const { notFound, errorHandler } = require('./src/middlewares/errorHandler');
const { requireAdminSession, timingSafeEqual } = require('./src/middlewares/auth');
const { createRateLimiter } = require('./src/middlewares/rateLimiter');

const projectsRateLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 10 });
const diagnosticsRateLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 10 });
const loginRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const radarRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 60,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
});
const radarLeadRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 60,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
});

const app = express();
app.use(express.json());
app.use(cookieParser(process.env.ADMIN_KEY));

app.post('/api/login', loginRateLimiter, (req, res) => {
  const expected = process.env.ADMIN_KEY;
  const { senha } = req.body;

  if (!expected || !senha || !timingSafeEqual(senha, expected)) {
    return res.status(401).json({ error: { message: 'Senha incorreta' } });
  }

  res.cookie('session', 'ok', {
    httpOnly: true,
    signed: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
  });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

app.get('/admin.html', requireAdminSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin-diagnostico.html', requireAdminSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-diagnostico.html'));
});

app.get('/admin-radar.html', requireAdminSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-radar.html'));
});

app.get('/central.html', requireAdminSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'central.html'));
});

app.get('/painel', requireAdminSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'central.html'));
});

app.get('/diagnostico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'diagnostico.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/projects', projectsRateLimiter, projectRoutes);
app.use('/api/diagnostics', diagnosticsRateLimiter, diagnosticRoutes);
app.use('/api/radar/campaigns', radarRateLimiter, radarRoutes);
app.use('/api/radar/campaigns/:campaignId/leads', radarLeadRateLimiter, radarLeadRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;