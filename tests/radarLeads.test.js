process.env.ADMIN_KEY = 'test-key';

require('./setup');

const request = require('supertest');
const app = require('../app');

const AUTH = { 'x-admin-key': 'test-key' };
const ID_INEXISTENTE = '64b000000000000000000000';

function campanhaPayload(overrides = {}) {
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
    .send(campanhaPayload(overrides));
  return res.body.data;
}

function leadPayload(overrides = {}) {
  return {
    nomeEmpresa: 'Clínica Teste',
    ...overrides,
  };
}

async function criarLead(campaignId, overrides = {}) {
  const res = await request(app)
    .post(`/api/radar/campaigns/${campaignId}/leads`)
    .set(AUTH)
    .send(leadPayload(overrides));
  return res.body.data;
}

describe('POST /api/radar/campaigns/:campaignId/leads', () => {
  test('401 sem admin key', async () => {
    const campanha = await criarCampanha();
    const res = await request(app)
      .post(`/api/radar/campaigns/${campanha._id}/leads`)
      .send(leadPayload());
    expect(res.status).toBe(401);
  });

  test('cria lead só com nomeEmpresa', async () => {
    const campanha = await criarCampanha();
    const res = await request(app)
      .post(`/api/radar/campaigns/${campanha._id}/leads`)
      .set(AUTH)
      .send(leadPayload());

    expect(res.status).toBe(201);
    expect(res.body.data.nomeEmpresa).toBe('Clínica Teste');
    expect(res.body.data.campaign_id).toBe(campanha._id);
  });

  test('status default é "novo"', async () => {
    const campanha = await criarCampanha();
    const res = await request(app)
      .post(`/api/radar/campaigns/${campanha._id}/leads`)
      .set(AUTH)
      .send(leadPayload());

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('novo');
  });

  test('prioridade default é "media"', async () => {
    const campanha = await criarCampanha();
    const res = await request(app)
      .post(`/api/radar/campaigns/${campanha._id}/leads`)
      .set(AUTH)
      .send(leadPayload());

    expect(res.status).toBe(201);
    expect(res.body.data.prioridade).toBe('media');
  });

  test('aceita campos opcionais', async () => {
    const campanha = await criarCampanha();
    const res = await request(app)
      .post(`/api/radar/campaigns/${campanha._id}/leads`)
      .set(AUTH)
      .send(
        leadPayload({
          nicho: 'Clínica odontológica infantil',
          cidade: 'Cascais',
          pais: 'Portugal',
          site: 'https://clinicateste.pt',
          instagram: '@clinicateste',
          email: 'contato@clinicateste.pt',
          telefone: '+351 900 000 000',
          googleMapsUrl: 'https://maps.google.com/?q=clinica+teste',
          observacoes: 'Encontrada via pesquisa manual.',
        })
      );

    expect(res.status).toBe(201);
    expect(res.body.data.nicho).toBe('Clínica odontológica infantil');
    expect(res.body.data.cidade).toBe('Cascais');
    expect(res.body.data.pais).toBe('Portugal');
    expect(res.body.data.site).toBe('https://clinicateste.pt');
    expect(res.body.data.instagram).toBe('@clinicateste');
    expect(res.body.data.email).toBe('contato@clinicateste.pt');
    expect(res.body.data.telefone).toBe('+351 900 000 000');
    expect(res.body.data.googleMapsUrl).toBe('https://maps.google.com/?q=clinica+teste');
    expect(res.body.data.observacoes).toBe('Encontrada via pesquisa manual.');
  });

  test('rejeita sem nomeEmpresa', async () => {
    const campanha = await criarCampanha();
    const res = await request(app)
      .post(`/api/radar/campaigns/${campanha._id}/leads`)
      .set(AUTH)
      .send(leadPayload({ nomeEmpresa: undefined }));

    expect(res.status).toBe(400);
  });

  test('404 quando campanha não existe', async () => {
    const res = await request(app)
      .post(`/api/radar/campaigns/${ID_INEXISTENTE}/leads`)
      .set(AUTH)
      .send(leadPayload());

    expect(res.status).toBe(404);
  });

  test('400 quando campaignId é malformado', async () => {
    const res = await request(app)
      .post('/api/radar/campaigns/id-invalido/leads')
      .set(AUTH)
      .send(leadPayload());

    expect(res.status).toBe(400);
  });
});

describe('GET /api/radar/campaigns/:campaignId/leads', () => {
  test('401 sem admin key', async () => {
    const campanha = await criarCampanha();
    const res = await request(app).get(`/api/radar/campaigns/${campanha._id}/leads`);
    expect(res.status).toBe(401);
  });

  test('lista vazia quando não há leads', async () => {
    const campanha = await criarCampanha();
    const res = await request(app).get(`/api/radar/campaigns/${campanha._id}/leads`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  test('lista paginada', async () => {
    const campanha = await criarCampanha();
    await criarLead(campanha._id, { nomeEmpresa: 'Lead A' });
    await criarLead(campanha._id, { nomeEmpresa: 'Lead B' });

    const res = await request(app).get(`/api/radar/campaigns/${campanha._id}/leads`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(2);
  });

  test('filtra por status', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id, { nomeEmpresa: 'Lead Analisado' });
    await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ status: 'analisado' });
    await criarLead(campanha._id, { nomeEmpresa: 'Lead Novo' });

    const res = await request(app)
      .get(`/api/radar/campaigns/${campanha._id}/leads?status=analisado`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('analisado');
  });

  test('filtra por prioridade', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id, { nomeEmpresa: 'Lead Urgente' });
    await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ prioridade: 'urgente' });
    await criarLead(campanha._id, { nomeEmpresa: 'Lead Comum' });

    const res = await request(app)
      .get(`/api/radar/campaigns/${campanha._id}/leads?prioridade=urgente`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].prioridade).toBe('urgente');
  });

  test('isolamento: leads de uma campanha não aparecem em outra', async () => {
    const campanhaA = await criarCampanha({ produto: 'Produto A' });
    const campanhaB = await criarCampanha({ produto: 'Produto B' });
    await criarLead(campanhaA._id, { nomeEmpresa: 'Lead da Campanha A' });
    await criarLead(campanhaB._id, { nomeEmpresa: 'Lead da Campanha B' });

    const res = await request(app).get(`/api/radar/campaigns/${campanhaA._id}/leads`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].nomeEmpresa).toBe('Lead da Campanha A');
  });
});

describe('GET /api/radar/campaigns/:campaignId/leads/:id', () => {
  test('401 sem admin key', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);
    const res = await request(app).get(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`);
    expect(res.status).toBe(401);
  });

  test('retorna o lead correto', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id, { nomeEmpresa: 'Lead Detalhe' });

    const res = await request(app)
      .get(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.nomeEmpresa).toBe('Lead Detalhe');
  });

  test('404 para id inexistente', async () => {
    const campanha = await criarCampanha();
    const res = await request(app)
      .get(`/api/radar/campaigns/${campanha._id}/leads/${ID_INEXISTENTE}`)
      .set(AUTH);

    expect(res.status).toBe(404);
  });

  test('404 ao buscar lead com campaignId de outra campanha', async () => {
    const campanhaA = await criarCampanha({ produto: 'Produto A' });
    const campanhaB = await criarCampanha({ produto: 'Produto B' });
    const lead = await criarLead(campanhaA._id, { nomeEmpresa: 'Lead da Campanha A' });

    const res = await request(app)
      .get(`/api/radar/campaigns/${campanhaB._id}/leads/${lead._id}`)
      .set(AUTH);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/radar/campaigns/:campaignId/leads/:id', () => {
  test('401 sem admin key', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);
    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .send({ status: 'analisado' });
    expect(res.status).toBe(401);
  });

  test('atualiza campos básicos', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ cidade: 'Porto', observacoes: 'Contato inicial feito.' });

    expect(res.status).toBe(200);
    expect(res.body.data.cidade).toBe('Porto');
    expect(res.body.data.observacoes).toBe('Contato inicial feito.');
  });

  test('atualiza status para valor válido', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ status: 'contatado' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('contatado');
  });

  test('rejeita status inválido', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ status: 'invalido' });

    expect(res.status).toBe(400);
  });

  test('atualiza prioridade para valor válido', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ prioridade: 'alta' });

    expect(res.status).toBe(200);
    expect(res.body.data.prioridade).toBe('alta');
  });

  test('rejeita prioridade inválida', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ prioridade: 'invalida' });

    expect(res.status).toBe(400);
  });

  test('404 para id inexistente', async () => {
    const campanha = await criarCampanha();
    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${ID_INEXISTENTE}`)
      .set(AUTH)
      .send({ status: 'analisado' });

    expect(res.status).toBe(404);
  });

  test('400 quando não há nada para atualizar', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({});

    expect(res.status).toBe(400);
  });

  test('404 ao tentar editar lead de outra campanha', async () => {
    const campanhaA = await criarCampanha({ produto: 'Produto A' });
    const campanhaB = await criarCampanha({ produto: 'Produto B' });
    const lead = await criarLead(campanhaA._id, { nomeEmpresa: 'Lead da Campanha A' });

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanhaB._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ status: 'analisado' });

    expect(res.status).toBe(404);
  });
});
