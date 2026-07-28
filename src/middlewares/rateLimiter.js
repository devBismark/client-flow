function createRateLimiter({ windowMs = 10 * 60 * 1000, max = 10, methods = ['POST'] } = {}) {
  const hits = new Map();
  const methodSet = methods ? new Set(methods) : null;

  return function rateLimiter(req, res, next) {
    if (process.env.NODE_ENV === 'test') return next();
    if (methodSet && !methodSet.has(req.method)) return next();

    const key = req.ip;
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }

    if (entry.count >= max) {
      return res.status(429).json({
        error: { message: 'Muitas requisições. Tente novamente em alguns minutos.' },
      });
    }

    entry.count += 1;
    next();
  };
}

module.exports = { createRateLimiter };
