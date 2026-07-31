process.env.ADMIN_KEY = 'test-key';

require('./setup');

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../app');

describe('public/central.html — hrefs dos cards internos', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'central.html'), 'utf8');

  test('cards internos apontam para a convenção /painel/...', () => {
    expect(html).toContain('href="/painel/briefings"');
    expect(html).toContain('href="/painel/diagnostico"');
    expect(html).toContain('href="/painel/radar"');
  });

  test('não referencia mais as rotas antigas nos cards internos', () => {
    expect(html).not.toContain('href="/admin.html"');
    expect(html).not.toContain('href="/admin-diagnostico.html"');
    expect(html).not.toContain('href="/admin-radar.html"');
  });

  test('links públicos preservados, sem alteração', () => {
    expect(html).toContain('href="/briefing"');
    expect(html).toContain('href="/diagnostico"');
    expect(html).toContain('href="https://idistopic.com"');
  });
});

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

describe.each([
  ['/painel/briefings'],
  ['/painel/diagnostico'],
  ['/painel/radar'],
])('GET %s (rota nova, convenção /painel/...)', (rota) => {
  test('sem sessão redireciona para /login.html', async () => {
    const res = await request(app).get(rota);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login.html');
  });

  test('com sessão válida retorna 200', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ senha: 'test-key' });

    const res = await agent.get(rota);
    expect(res.status).toBe(200);
  });
});

describe.each([
  ['/admin.html'],
  ['/admin-diagnostico.html'],
  ['/admin-radar.html'],
])('GET %s (rota antiga, não regride com a migração para /painel/...)', (rota) => {
  test('sem sessão redireciona para /login.html', async () => {
    const res = await request(app).get(rota);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login.html');
  });

  test('com sessão válida retorna 200', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ senha: 'test-key' });

    const res = await agent.get(rota);
    expect(res.status).toBe(200);
  });
});
