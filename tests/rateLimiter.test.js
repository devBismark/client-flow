const { createRateLimiter } = require('../src/middlewares/rateLimiter');

function mockReq({ method = 'POST', ip = '127.0.0.1' } = {}) {
  return { method, ip };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('createRateLimiter', () => {
  const nodeEnvOriginal = process.env.NODE_ENV;

  beforeEach(() => {
    // a lógica de contagem só roda fora de NODE_ENV=test — os outros
    // arquivos de teste dependem do bypass, então restauramos sempre.
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    process.env.NODE_ENV = nodeEnvOriginal;
  });

  test('permite requisições abaixo do limite', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 3 });
    const next = jest.fn();

    limiter(mockReq(), mockRes(), next);
    limiter(mockReq(), mockRes(), next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  test('bloqueia com 429 ao exceder o limite dentro da janela', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 2 });
    const next = jest.fn();

    limiter(mockReq(), mockRes(), next);
    limiter(mockReq(), mockRes(), next);

    const res = mockRes();
    limiter(mockReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ message: expect.any(String) }) })
    );
    expect(next).toHaveBeenCalledTimes(2);
  });

  test('reseta a contagem após a janela expirar', () => {
    const limiter = createRateLimiter({ windowMs: 50, max: 1 });
    const next = jest.fn();

    limiter(mockReq(), mockRes(), next);

    const blocked = mockRes();
    limiter(mockReq(), blocked, next);
    expect(blocked.status).toHaveBeenCalledWith(429);

    return new Promise((resolve) => {
      setTimeout(() => {
        limiter(mockReq(), mockRes(), next);
        expect(next).toHaveBeenCalledTimes(2);
        resolve();
      }, 60);
    });
  });

  test('ignora métodos fora da lista de "methods"', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 1, methods: ['POST'] });
    const next = jest.fn();

    limiter(mockReq({ method: 'GET' }), mockRes(), next);
    limiter(mockReq({ method: 'GET' }), mockRes(), next);
    limiter(mockReq({ method: 'GET' }), mockRes(), next);

    expect(next).toHaveBeenCalledTimes(3);
  });

  test('contadores são independentes entre instâncias distintas', () => {
    const limiterA = createRateLimiter({ windowMs: 60000, max: 1 });
    const limiterB = createRateLimiter({ windowMs: 60000, max: 1 });
    const next = jest.fn();

    limiterA(mockReq(), mockRes(), next);

    const resB = mockRes();
    limiterB(mockReq(), resB, next);

    expect(resB.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(2);
  });

  test('respeita o bypass de NODE_ENV=test', () => {
    process.env.NODE_ENV = 'test';
    const limiter = createRateLimiter({ windowMs: 60000, max: 1 });
    const next = jest.fn();

    limiter(mockReq(), mockRes(), next);
    limiter(mockReq(), mockRes(), next);
    limiter(mockReq(), mockRes(), next);

    expect(next).toHaveBeenCalledTimes(3);
  });
});
