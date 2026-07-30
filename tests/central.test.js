process.env.ADMIN_KEY = 'test-key';

require('./setup');

const request = require('supertest');
const app = require('../app');

describe('GET /central.html', () => {
  test('sem sessão redireciona para /login.html', async () => {
    const res = await request(app).get('/central.html');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login.html');
  });

  test('com sessão válida retorna 200', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ senha: 'test-key' });

    const res = await agent.get('/central.html');
    expect(res.status).toBe(200);
  });
});

describe('GET /painel', () => {
  test('sem sessão redireciona para /login.html', async () => {
    const res = await request(app).get('/painel');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login.html');
  });

  test('com sessão válida retorna 200', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ senha: 'test-key' });

    const res = await agent.get('/painel');
    expect(res.status).toBe(200);
  });
});
