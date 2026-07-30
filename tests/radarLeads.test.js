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

describe('PATCH /api/radar/campaigns/:campaignId/leads/:id — análise manual', () => {
  test('aceita campos booleanos de análise', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({
        temSite: true,
        siteProfissional: false,
        siteResponsivo: true,
        temWhatsapp: true,
        temFormulario: false,
        temPaginaServicos: true,
        googleMapsPresente: true,
        instagramAtivo: false,
        parecePrecisarLandingPage: true,
        parecePrecisarAutomacao: false,
        parecePrecisarSistema: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.temSite).toBe(true);
    expect(res.body.data.siteProfissional).toBe(false);
    expect(res.body.data.siteResponsivo).toBe(true);
    expect(res.body.data.temWhatsapp).toBe(true);
    expect(res.body.data.temFormulario).toBe(false);
    expect(res.body.data.temPaginaServicos).toBe(true);
    expect(res.body.data.googleMapsPresente).toBe(true);
    expect(res.body.data.instagramAtivo).toBe(false);
    expect(res.body.data.parecePrecisarLandingPage).toBe(true);
    expect(res.body.data.parecePrecisarAutomacao).toBe(false);
    expect(res.body.data.parecePrecisarSistema).toBe(true);
  });

  test('aceita problemasEncontrados como array', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ problemasEncontrados: ['Sem site', 'Sem WhatsApp visível'] });

    expect(res.status).toBe(200);
    expect(res.body.data.problemasEncontrados).toEqual(['Sem site', 'Sem WhatsApp visível']);
  });

  test('aceita solucaoRecomendada e produtoRecomendado', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({
        solucaoRecomendada: 'Criar landing page com formulário de agendamento.',
        produtoRecomendado: 'Landing page',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.solucaoRecomendada).toBe('Criar landing page com formulário de agendamento.');
    expect(res.body.data.produtoRecomendado).toBe('Landing page');
  });

  test('análise em lead novo muda status para "analisado" automaticamente', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);
    expect(lead.status).toBe('novo');

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ temSite: true });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('analisado');
  });

  test('análise em lead com status "contatado" não muda o status', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ status: 'contatado' });

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ temSite: true, problemasEncontrados: ['Sem formulário'] });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('contatado');
  });

  test('status explícito no mesmo PATCH de análise prevalece sobre o avanço automático', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);
    expect(lead.status).toBe('novo');

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ temSite: true, status: 'contatado' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('contatado');
  });

  test('analisadoEm é definido quando há atualização de análise', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);
    expect(lead.analisadoEm).toBeUndefined();

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ produtoRecomendado: 'Sistema interno' });

    expect(res.status).toBe(200);
    expect(res.body.data.analisadoEm).toBeTruthy();
  });

  test('analisadoEm não é definido em atualização sem campos de análise', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ cidade: 'Porto' });

    expect(res.status).toBe(200);
    expect(res.body.data.analisadoEm).toBeFalsy();
  });

  test('novo lead nasce com defaults de análise vazios', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    expect(lead.temSite).toBe(false);
    expect(lead.problemasEncontrados).toEqual([]);
    expect(lead.solucaoRecomendada).toBe('');
    expect(lead.produtoRecomendado).toBe('');
    expect(lead.analisadoEm).toBeFalsy();
  });
});

describe('POST /api/radar/campaigns/:campaignId/leads/import', () => {
  async function importar(campaignId, texto) {
    return request(app)
      .post(`/api/radar/campaigns/${campaignId}/leads/import`)
      .set(AUTH)
      .send({ texto });
  }

  test('401 sem admin key', async () => {
    const campanha = await criarCampanha();
    const res = await request(app)
      .post(`/api/radar/campaigns/${campanha._id}/leads/import`)
      .send({ texto: 'Clínica Teste; Lisboa' });

    expect(res.status).toBe(401);
  });

  test('importa múltiplas linhas válidas', async () => {
    const campanha = await criarCampanha();
    const texto = [
      'Clínica A; Lisboa; Portugal; https://a.pt; @clinicaa; a@a.pt; +351900000001; Nota A',
      'Clínica B; Porto; Portugal; https://b.pt; @clinicab; b@b.pt; +351900000002; Nota B',
    ].join('\n');

    const res = await importar(campanha._id, texto);

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toEqual({ total: 2, created: 2, skipped: 0, errors: 0 });
    expect(res.body.data.results).toHaveLength(2);
    expect(res.body.data.results[0].status).toBe('created');
    expect(res.body.data.results[0].lead.nomeEmpresa).toBe('Clínica A');
    expect(res.body.data.results[0].lead.email).toBe('a@a.pt');
    expect(res.body.data.results[1].lead.nomeEmpresa).toBe('Clínica B');

    const lista = await request(app).get(`/api/radar/campaigns/${campanha._id}/leads`).set(AUTH);
    expect(lista.body.meta.total).toBe(2);
  });

  test('campos ausentes viram string vazia, só nomeEmpresa é obrigatório', async () => {
    const campanha = await criarCampanha();
    const res = await importar(campanha._id, 'Clínica Mínima');

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toEqual({ total: 1, created: 1, skipped: 0, errors: 0 });
    const lead = res.body.data.results[0].lead;
    expect(lead.nomeEmpresa).toBe('Clínica Mínima');
    expect(lead.cidade).toBe('');
    expect(lead.pais).toBe('');
    expect(lead.site).toBe('');
    expect(lead.instagram).toBe('');
    expect(lead.email).toBe('');
    expect(lead.telefone).toBe('');
    expect(lead.observacoes).toBe('');
  });

  test('linha sem nomeEmpresa vira erro e não cria lead', async () => {
    const campanha = await criarCampanha();
    const texto = [
      'Clínica Válida; Lisboa',
      '; Porto; Portugal',
    ].join('\n');

    const res = await importar(campanha._id, texto);

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toEqual({ total: 2, created: 1, skipped: 0, errors: 1 });
    expect(res.body.data.results[1].status).toBe('error');
    expect(res.body.data.results[1].line).toBe(2);

    const lista = await request(app).get(`/api/radar/campaigns/${campanha._id}/leads`).set(AUTH);
    expect(lista.body.meta.total).toBe(1);
  });

  test('observações com ponto e vírgula não quebram o parsing', async () => {
    const campanha = await criarCampanha();
    const texto = 'Clínica X; Lisboa; Portugal; ; ; ; ; Ligou às 10h; disse que vai retornar; interessada';

    const res = await importar(campanha._id, texto);

    expect(res.status).toBe(200);
    expect(res.body.data.results[0].lead.observacoes).toBe('Ligou às 10h; disse que vai retornar; interessada');
  });

  test('dedupe dentro do mesmo lote — segunda ocorrência de nomeEmpresa+cidade é ignorada', async () => {
    const campanha = await criarCampanha();
    const texto = [
      'Clínica Repetida; Lisboa',
      'Clínica Repetida; Lisboa',
    ].join('\n');

    const res = await importar(campanha._id, texto);

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toEqual({ total: 2, created: 1, skipped: 1, errors: 0 });
    expect(res.body.data.results[1].status).toBe('skipped');
  });

  test('dedupe contra lead já existente por email', async () => {
    const campanha = await criarCampanha();
    const existente = await criarLead(campanha._id, {
      nomeEmpresa: 'Clínica Original',
      email: 'contato@original.pt',
    });

    const res = await importar(
      campanha._id,
      'Clínica Diferente; Outra Cidade; ; ; ; contato@original.pt; ; '
    );

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toEqual({ total: 1, created: 0, skipped: 1, errors: 0 });

    const detalhe = await request(app)
      .get(`/api/radar/campaigns/${campanha._id}/leads/${existente._id}`)
      .set(AUTH);
    expect(detalhe.body.data.nomeEmpresa).toBe('Clínica Original');
  });

  test('dedupe contra lead já existente por telefone', async () => {
    const campanha = await criarCampanha();
    await criarLead(campanha._id, {
      nomeEmpresa: 'Clínica Original',
      telefone: '+351900000099',
    });

    const res = await importar(
      campanha._id,
      'Clínica Diferente; ; ; ; ; ; +351900000099; '
    );

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toEqual({ total: 1, created: 0, skipped: 1, errors: 0 });
  });

  test('isolamento: mesmo nomeEmpresa+cidade em outra campanha não é tratado como duplicata', async () => {
    const campanhaA = await criarCampanha({ produto: 'Produto A' });
    const campanhaB = await criarCampanha({ produto: 'Produto B' });
    await criarLead(campanhaA._id, { nomeEmpresa: 'Clínica Comum', cidade: 'Lisboa' });

    const res = await importar(campanhaB._id, 'Clínica Comum; Lisboa');

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toEqual({ total: 1, created: 1, skipped: 0, errors: 0 });
  });

  test('400 quando texto vazio', async () => {
    const campanha = await criarCampanha();
    const res = await importar(campanha._id, '');
    expect(res.status).toBe(400);
  });

  test('400 quando texto ausente', async () => {
    const campanha = await criarCampanha();
    const res = await request(app)
      .post(`/api/radar/campaigns/${campanha._id}/leads/import`)
      .set(AUTH)
      .send({});
    expect(res.status).toBe(400);
  });

  test('400 quando excede o limite de linhas', async () => {
    const campanha = await criarCampanha();
    const texto = Array.from({ length: 501 }, (_, i) => `Lead ${i}`).join('\n');

    const res = await importar(campanha._id, texto);
    expect(res.status).toBe(400);
  });

  test('404 quando campanha não existe', async () => {
    const res = await importar(ID_INEXISTENTE, 'Clínica Teste; Lisboa');
    expect(res.status).toBe(404);
  });

  test('400 quando campaignId é malformado', async () => {
    const res = await request(app)
      .post('/api/radar/campaigns/id-invalido/leads/import')
      .set(AUTH)
      .send({ texto: 'Clínica Teste; Lisboa' });
    expect(res.status).toBe(400);
  });
});
