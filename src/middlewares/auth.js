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

module.exports = { requireAdminKey };