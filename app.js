const path = require('path');
const express = require('express');
const projectRoutes = require('./src/routes/projectRoutes');
const { notFound, errorHandler } = require('./src/middlewares/errorHandler');

const app = express();

app.use(express.json());
const { requireAdminBasicAuth } = require('./src/middlewares/auth');

app.get('/admin.html', requireAdminBasicAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/projects', projectRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;