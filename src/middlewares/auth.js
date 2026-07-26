const crypto = require('crypto');

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireAdminKey(req, res, next) {
  const expected = process.env.ADMIN_KEY;

  if (!expected) {
    return res.status(500).json({ error: { message: 'Servidor mal configurado' } });
  }

  const provided = req.get('x-admin-key');

  if (!provided || !timingSafeEqual(provided, expected)) {
    return res.status(401).json({ error: { message: 'Não autorizado' } });
  }

  next();
}

  function requireAdminBasicAuth(req, res, next) {
  const expected = process.env.ADMIN_KEY;
  const header = req.get('authorization');

  if (!header || !header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Painel"');
    return res.status(401).send('Autenticação necessária');
  }

  const decoded = Buffer.from(header.slice(6), 'base64').toString();
  const password = decoded.split(':')[1] || '';

  if (!expected || !timingSafeEqual(password, expected)) {
    res.set('WWW-Authenticate', 'Basic realm="Painel"');
    return res.status(401).send('Credenciais inválidas');
  }

  next();
}

module.exports = { requireAdminKey, requireAdminBasicAuth };