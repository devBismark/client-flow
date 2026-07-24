process.env.ADMIN_KEY = 'test-key';

require('./setup');

const request = require('supertest');
const app = require('../app');

const AUTH = { 'x-admin-key': 'test-key' };

const briefingPremium = {
  multiploServicos: true,
  querAparecerGoogle: true,
  temConcorrenteReferencia: true,
  querInteracao: true,
  materialDeSobra: true,
};

async function criarProjeto(overrides = {}) {
  const res = await request(app)
    .post('/api/projects')
    .send({
      clientName: 'Cliente Teste',
      clientContact: 'teste@email.com',
      briefingAnswers: briefingPremium,
      ...overrides,
    });
  return res.body.data;
}

describe('GET /health', () => {
  test('responde 200 com status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('POST /api/projects', () => {
  test('cria projeto e calcula tier premium', async () => {
    const res = await request(app).post('/api/projects').send({
      clientName: 'Jessie Nails',
      clientContact: '@jes.sienails',
      briefingAnswers: briefingPremium,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.suggestedTier).toBe('premium');
    expect(res.body.data.status).toBe('briefing');
    expect(res.body.data.finalTier).toBeNull();
  });

  test('calcula tier essencial com poucas respostas', async () => {
    const res = await request(app).post('/api/projects').send({
      clientName: 'Simples',
      clientContact: 'simples@email.com',
      briefingAnswers: { multiploServicos: true },
    });

    expect(res.status).toBe(201);
    expect(res.body.data.suggestedTier).toBe('essencial');
  });

  test('rejeita sem clientName', async () => {
    const res = await request(app).post('/api/projects').send({
      clientContact: 'sem-nome@email.com',
      briefingAnswers: {},
    });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Dados inválidos');
  });

  test('rejeita sem clientContact', async () => {
    const res = await request(app).post('/api/projects').send({
      clientName: 'Sem Contato',
      briefingAnswers: {},
    });

    expect(res.status).toBe(400);
  });

  test('não exige admin key', async () => {
    const res = await request(app).post('/api/projects').send({
      clientName: 'Público',
      clientContact: 'publico@email.com',
      briefingAnswers: {},
    });

    expect(res.status).toBe(201);
  });
});

describe('autenticação', () => {
  test('401 sem header x-admin-key', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Não autorizado');
  });

  test('401 com chave errada', async () => {
    const res = await request(app).get('/api/projects').set({ 'x-admin-key': 'errada' });
    expect(res.status).toBe(401);
  });

  test('200 com chave correta', async () => {
    const res = await request(app).get('/api/projects').set(AUTH);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/projects', () => {
  test('lista vazia quando não há projetos', async () => {
    const res = await request(app).get('/api/projects').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  test('retorna projetos criados com meta de paginação', async () => {
    await criarProjeto({ clientName: 'A' });
    await criarProjeto({ clientName: 'B' });

    const res = await request(app).get('/api/projects').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.meta.page).toBe(1);
  });

  test('filtra por status', async () => {
    const projeto = await criarProjeto();
    await request(app)
      .patch(`/api/projects/${projeto._id}/status`)
      .set(AUTH)
      .send({ status: 'aprovado' });
    await criarProjeto({ clientName: 'Outro' });

    const res = await request(app).get('/api/projects?status=aprovado').set(AUTH);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('aprovado');
  });

  test('respeita o limite de paginação', async () => {
    await criarProjeto({ clientName: 'A' });
    await criarProjeto({ clientName: 'B' });
    await criarProjeto({ clientName: 'C' });

    const res = await request(app).get('/api/projects?limit=2').set(AUTH);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(3);
  });
});

describe('GET /api/projects/:id', () => {
  test('retorna projeto existente', async () => {
    const projeto = await criarProjeto();
    const res = await request(app).get(`/api/projects/${projeto._id}`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(projeto._id);
  });

  test('404 para ID válido inexistente', async () => {
    const res = await request(app).get('/api/projects/000000000000000000000000').set(AUTH);
    expect(res.status).toBe(404);
  });

  test('400 para ID malformado', async () => {
    const res = await request(app).get('/api/projects/id-invalido').set(AUTH);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('ID inválido');
  });
});

describe('PATCH /api/projects/:id/status', () => {
  test('atualiza status válido', async () => {
    const projeto = await criarProjeto();
    const res = await request(app)
      .patch(`/api/projects/${projeto._id}/status`)
      .set(AUTH)
      .send({ status: 'orcamento_enviado' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('orcamento_enviado');
  });

  test('rejeita status inválido e lista os permitidos', async () => {
    const projeto = await criarProjeto();
    const res = await request(app)
      .patch(`/api/projects/${projeto._id}/status`)
      .set(AUTH)
      .send({ status: 'finalizado' });

    expect(res.status).toBe(400);
    expect(res.body.error.allowed).toContain('briefing');
  });

  test('404 para projeto inexistente', async () => {
    const res = await request(app)
      .patch('/api/projects/000000000000000000000000/status')
      .set(AUTH)
      .send({ status: 'aprovado' });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/projects/:id/proposal', () => {
  test('gera orçamento com preço e entrada', async () => {
    const projeto = await criarProjeto();
    const res = await request(app).get(`/api/projects/${projeto._id}/proposal`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.tier).toBe('premium');
    expect(res.body.data.priceRange).toBe('500–700€');
    expect(res.body.data.entrada).toBe('250€');
  });

  test('404 para projeto inexistente', async () => {
    const res = await request(app)
      .get('/api/projects/000000000000000000000000/proposal')
      .set(AUTH);
    expect(res.status).toBe(404);
  });
});
describe('PATCH /api/projects/:id', () => {
  test('define finalTier', async () => {
    const projeto = await criarProjeto();
    const res = await request(app)
      .patch(`/api/projects/${projeto._id}`)
      .set(AUTH)
      .send({ finalTier: 'profissional' });

    expect(res.status).toBe(200);
    expect(res.body.data.finalTier).toBe('profissional');
    expect(res.body.data.suggestedTier).toBe('premium');
  });

  test('proposal usa finalTier quando definido', async () => {
    const projeto = await criarProjeto();
    await request(app)
      .patch(`/api/projects/${projeto._id}`)
      .set(AUTH)
      .send({ finalTier: 'essencial' });

    const res = await request(app).get(`/api/projects/${projeto._id}/proposal`).set(AUTH);
    expect(res.body.data.tier).toBe('essencial');
    expect(res.body.data.priceRange).toBe('150–200€');
  });

  test('atualiza notas', async () => {
    const projeto = await criarProjeto();
    const res = await request(app)
      .patch(`/api/projects/${projeto._id}`)
      .set(AUTH)
      .send({ notes: 'Cliente prefere tons neutros.' });

    expect(res.status).toBe(200);
    expect(res.body.data.notes).toBe('Cliente prefere tons neutros.');
  });

  test('rejeita tier inválido', async () => {
    const projeto = await criarProjeto();
    const res = await request(app)
      .patch(`/api/projects/${projeto._id}`)
      .set(AUTH)
      .send({ finalTier: 'ouro' });

    expect(res.status).toBe(400);
    expect(res.body.error.allowed).toContain('premium');
  });

  test('400 quando não há nada para atualizar', async () => {
    const projeto = await criarProjeto();
    const res = await request(app).patch(`/api/projects/${projeto._id}`).set(AUTH).send({});

    expect(res.status).toBe(400);
  });

  test('404 para projeto inexistente', async () => {
    const res = await request(app)
      .patch('/api/projects/000000000000000000000000')
      .set(AUTH)
      .send({ finalTier: 'premium' });

    expect(res.status).toBe(404);
  });
});

describe('rotas inexistentes', () => {
  test('404 com mensagem padrão', async () => {
    const res = await request(app).get('/api/nao-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Rota não encontrada');
  });
});