process.env.ADMIN_KEY = 'test-key';

require('./setup');

const request = require('supertest');
const app = require('../app');

const AUTH = { 'x-admin-key': 'test-key' };

function payloadBase(overrides = {}) {
  return {
    produto: 'Sites e landing pages',
    nicho: 'Clínicas odontológicas',
    cidade: 'Lisboa',
    objetivo: 'Agendar diagnóstico gratuito',
    ...overrides,
  };
}

async function criarCampanha(overrides = {}) {
  const res = await request(app)
    .post('/api/radar/campaigns')
    .set(AUTH)
    .send(payloadBase(overrides));
  return res.body.data;
}

describe('POST /api/radar/campaigns', () => {
  test('401 sem admin key', async () => {
    const res = await request(app).post('/api/radar/campaigns').send(payloadBase());
    expect(res.status).toBe(401);
  });

  test('cria campanha com campos válidos', async () => {
    const res = await request(app).post('/api/radar/campaigns').set(AUTH).send(payloadBase());

    expect(res.status).toBe(201);
    expect(res.body.data.produto).toBe('Sites e landing pages');
    expect(res.body.data.nicho).toBe('Clínicas odontológicas');
    expect(res.body.data.cidade).toBe('Lisboa');
    expect(res.body.data.objetivo).toBe('Agendar diagnóstico gratuito');
  });

  test('status default é "ativa"', async () => {
    const res = await request(app).post('/api/radar/campaigns').set(AUTH).send(payloadBase());
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ativa');
  });

  test('descricao default é string vazia', async () => {
    const res = await request(app).post('/api/radar/campaigns').set(AUTH).send(payloadBase());
    expect(res.status).toBe(201);
    expect(res.body.data.descricao).toBe('');
  });

  test('aceita descricao opcional', async () => {
    const res = await request(app)
      .post('/api/radar/campaigns')
      .set(AUTH)
      .send(payloadBase({ descricao: 'Campanha piloto de outbound.' }));

    expect(res.status).toBe(201);
    expect(res.body.data.descricao).toBe('Campanha piloto de outbound.');
  });

  test('rejeita sem produto', async () => {
    const res = await request(app)
      .post('/api/radar/campaigns')
      .set(AUTH)
      .send(payloadBase({ produto: undefined }));

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Dados inválidos');
  });

  test('rejeita sem nicho', async () => {
    const res = await request(app)
      .post('/api/radar/campaigns')
      .set(AUTH)
      .send(payloadBase({ nicho: undefined }));

    expect(res.status).toBe(400);
  });

  test('rejeita sem cidade', async () => {
    const res = await request(app)
      .post('/api/radar/campaigns')
      .set(AUTH)
      .send(payloadBase({ cidade: undefined }));

    expect(res.status).toBe(400);
  });

  test('rejeita sem objetivo', async () => {
    const res = await request(app)
      .post('/api/radar/campaigns')
      .set(AUTH)
      .send(payloadBase({ objetivo: undefined }));

    expect(res.status).toBe(400);
  });
});

describe('GET /api/radar/campaigns', () => {
  test('401 sem admin key', async () => {
    const res = await request(app).get('/api/radar/campaigns');
    expect(res.status).toBe(401);
  });

  test('200 com chave correta, lista vazia quando não há campanhas', async () => {
    const res = await request(app).get('/api/radar/campaigns').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  test('retorna campanhas criadas com meta de paginação', async () => {
    await criarCampanha({ produto: 'Produto A' });
    await criarCampanha({ produto: 'Produto B' });

    const res = await request(app).get('/api/radar/campaigns').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(2);
  });

  test('filtra por status', async () => {
    const pausada = await criarCampanha({ produto: 'Produto Pausado' });
    await request(app)
      .patch(`/api/radar/campaigns/${pausada._id}`)
      .set(AUTH)
      .send({ status: 'pausada' });
    await criarCampanha({ produto: 'Produto Ativo' });

    const res = await request(app).get('/api/radar/campaigns?status=pausada').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('pausada');
  });

  test('rejeita status de filtro inválido', async () => {
    const res = await request(app).get('/api/radar/campaigns?status=invalido').set(AUTH);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/radar/campaigns/:id', () => {
  test('401 sem admin key', async () => {
    const campanha = await criarCampanha();
    const res = await request(app).get(`/api/radar/campaigns/${campanha._id}`);
    expect(res.status).toBe(401);
  });

  test('retorna a campanha pelo id', async () => {
    const campanha = await criarCampanha({ produto: 'Produto Detalhe' });
    const res = await request(app).get(`/api/radar/campaigns/${campanha._id}`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.produto).toBe('Produto Detalhe');
  });

  test('404 para id inexistente', async () => {
    const res = await request(app)
      .get('/api/radar/campaigns/64b000000000000000000000')
      .set(AUTH);

    expect(res.status).toBe(404);
  });

  test('400 para id malformado', async () => {
    const res = await request(app).get('/api/radar/campaigns/id-invalido').set(AUTH);
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/radar/campaigns/:id', () => {
  test('401 sem admin key', async () => {
    const campanha = await criarCampanha();
    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}`)
      .send({ status: 'pausada' });
    expect(res.status).toBe(401);
  });

  test('atualiza campos básicos', async () => {
    const campanha = await criarCampanha();
    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}`)
      .set(AUTH)
      .send({ cidade: 'Porto', descricao: 'Ajustado após teste piloto.' });

    expect(res.status).toBe(200);
    expect(res.body.data.cidade).toBe('Porto');
    expect(res.body.data.descricao).toBe('Ajustado após teste piloto.');
  });

  test('atualiza status para valor válido', async () => {
    const campanha = await criarCampanha();
    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}`)
      .set(AUTH)
      .send({ status: 'encerrada' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('encerrada');
  });

  test('rejeita status inválido', async () => {
    const campanha = await criarCampanha();
    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}`)
      .set(AUTH)
      .send({ status: 'arquivada' });

    expect(res.status).toBe(400);
    expect(res.body.error.allowed).toEqual(['ativa', 'pausada', 'encerrada']);
  });

  test('404 para id inexistente', async () => {
    const res = await request(app)
      .patch('/api/radar/campaigns/64b000000000000000000000')
      .set(AUTH)
      .send({ status: 'pausada' });

    expect(res.status).toBe(404);
  });

  test('400 quando não há nada para atualizar', async () => {
    const campanha = await criarCampanha();
    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}`)
      .set(AUTH)
      .send({});

    expect(res.status).toBe(400);
  });
});
