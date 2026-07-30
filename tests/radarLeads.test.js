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

describe('DELETE /api/radar/campaigns/:campaignId/leads/:id', () => {
  test('401 sem admin key', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);
    const res = await request(app).delete(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`);
    expect(res.status).toBe(401);
  });

  test('exclui lead da campanha correta', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    const res = await request(app)
      .delete(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(lead._id);

    const busca = await request(app)
      .get(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH);
    expect(busca.status).toBe(404);
  });

  test('404 para id inexistente', async () => {
    const campanha = await criarCampanha();
    const res = await request(app)
      .delete(`/api/radar/campaigns/${campanha._id}/leads/${ID_INEXISTENTE}`)
      .set(AUTH);
    expect(res.status).toBe(404);
  });

  test('404 ao tentar excluir lead de outra campanha — nunca apaga por campaignId errado', async () => {
    const campanhaA = await criarCampanha({ produto: 'Produto A' });
    const campanhaB = await criarCampanha({ produto: 'Produto B' });
    const lead = await criarLead(campanhaA._id, { nomeEmpresa: 'Lead da Campanha A' });

    const res = await request(app)
      .delete(`/api/radar/campaigns/${campanhaB._id}/leads/${lead._id}`)
      .set(AUTH);

    expect(res.status).toBe(404);

    const aindaExiste = await request(app)
      .get(`/api/radar/campaigns/${campanhaA._id}/leads/${lead._id}`)
      .set(AUTH);
    expect(aindaExiste.status).toBe(200);
  });

  test('404 quando campanha não existe', async () => {
    const res = await request(app)
      .delete(`/api/radar/campaigns/${ID_INEXISTENTE}/leads/${ID_INEXISTENTE}`)
      .set(AUTH);
    expect(res.status).toBe(404);
  });

  test('400 quando campaignId é malformado', async () => {
    const res = await request(app)
      .delete('/api/radar/campaigns/id-invalido/leads/id-invalido')
      .set(AUTH);
    expect(res.status).toBe(400);
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

  test('análise em lead novo com status "novo" reenviado (igual ao atual) ainda avança para "analisado"', async () => {
    // Reproduz o payload real do admin-radar.html: o select de status é sempre
    // reenviado, mesmo sem alteração do usuário.
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);
    expect(lead.status).toBe('novo');

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ temSite: true, status: 'novo' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('analisado');
  });

  test('análise em lead "contatado" com status "contatado" reenviado (igual ao atual) permanece "contatado"', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ status: 'contatado' });

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ temSite: true, status: 'contatado' });

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

describe('PATCH /api/radar/campaigns/:campaignId/leads/:id — mensagem assistida', () => {
  test('novo lead nasce com defaults de mensagem vazios', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    expect(lead.mensagemGerada).toBe('');
    expect(lead.mensagemCanal).toBe('manual');
    expect(lead.mensagemGeradaEm).toBeFalsy();
  });

  test('PATCH salva mensagemGerada, mensagemCanal e define mensagemGeradaEm', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({
        mensagemGerada: 'Olá! Vi o trabalho de vocês e acho que posso ajudar.',
        mensagemCanal: 'whatsapp',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.mensagemGerada).toBe('Olá! Vi o trabalho de vocês e acho que posso ajudar.');
    expect(res.body.data.mensagemCanal).toBe('whatsapp');
    expect(res.body.data.mensagemGeradaEm).toBeTruthy();
  });

  test('rejeita mensagemCanal inválido', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ mensagemCanal: 'sms' });

    expect(res.status).toBe(400);
  });

  test('salvar mensagem em lead "analisado" avança automaticamente para "mensagem_gerada"', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ status: 'analisado' });

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ mensagemGerada: 'Mensagem sugerida.' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('mensagem_gerada');
  });

  test('reproduz o bug relatado: mensagem + status "analisado" reenviado igual ao atual ainda avança para "mensagem_gerada"', async () => {
    // Reproduz o payload real do admin-radar.html: se o formulário reenviar o
    // status atual junto da mensagem, isso não pode ser tratado como troca
    // explícita — mesma classe de bug já corrigida para a análise manual.
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ status: 'analisado' });

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ mensagemGerada: 'Mensagem sugerida.', mensagemCanal: 'whatsapp', status: 'analisado' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('mensagem_gerada');
  });

  test('status explícito diferente prevalece sobre o avanço automático da mensagem', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ status: 'analisado' });

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ mensagemGerada: 'Mensagem sugerida.', status: 'contatado' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('contatado');
  });

  test('mensagem salva em lead que ainda não foi analisado (status "novo") não avança sozinha', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);
    expect(lead.status).toBe('novo');

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ mensagemGerada: 'Mensagem sugerida.' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('novo');
  });

  test('mensagem em lead já "contatado" não regride o status', async () => {
    const campanha = await criarCampanha();
    const lead = await criarLead(campanha._id);

    await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ status: 'contatado' });

    const res = await request(app)
      .patch(`/api/radar/campaigns/${campanha._id}/leads/${lead._id}`)
      .set(AUTH)
      .send({ mensagemGerada: 'Mensagem sugerida.', mensagemCanal: 'email' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('contatado');
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

describe('public/admin-radar.html — seção de análise do lead', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin-radar.html'),
    'utf8'
  );

  test('o card de lead inclui o botão/seção "Análise do lead"', () => {
    expect(html).toContain('Análise do lead');
    expect(html).toContain('analise-toggle');
    expect(html).toContain('analise-body');
  });

  test('a seção de análise inclui os checkboxes, textarea de problemas e campos de solução/produto', () => {
    expect(html).toContain('campo-analise');
    expect(html).toContain('campo-lead-problemasEncontrados');
    expect(html).toContain('campo-lead-solucaoRecomendada');
    expect(html).toContain('campo-lead-produtoRecomendado');
  });
});

describe('public/admin-radar.html — pesquisa assistida', () => {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin-radar.html'),
    'utf8'
  );

  // Este projeto não usa jsdom (nenhuma dependência nova permitida) e o Jest
  // roda com testEnvironment: 'node' — sem `document`/`window` reais. Por isso
  // a lógica pura de geração de consultas (`gerarConsultasPesquisa`) é testada
  // executando o próprio <script> num sandbox `vm` com um `document` mínimo
  // (suficiente para os listeners de topo não lançarem erro), e a parte visual
  // (botões/links renderizados) é coberta só por asserção de texto estático no
  // HTML — a mesma abordagem já usada para validar a seção "Análise do lead".
  function carregarScriptCliente() {
    const match = html.match(/<script>([\s\S]*?)<\/script>/);
    const code = match[1];

    function makeEl() {
      return {
        value: '', textContent: '', innerHTML: '', className: '', style: {}, dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener() {},
        appendChild() {},
        querySelector() { return makeEl(); },
        querySelectorAll() { return []; },
        closest() { return makeEl(); },
      };
    }

    const fakeDocument = {
      getElementById() { return makeEl(); },
      createElement() { return makeEl(); },
      addEventListener() {},
      querySelectorAll() { return []; },
    };

    const sandbox = {
      document: fakeDocument,
      window: {},
      navigator: { clipboard: { writeText: async () => {} } },
      fetch: async () => ({ ok: true, json: async () => ({ data: [], meta: { page: 1, limit: 20, total: 0 } }) }),
      console,
      URLSearchParams,
      setTimeout,
      alert: () => {},
    };

    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: 'admin-radar-script.js' });
    return sandbox;
  }

  test('a UI inclui a seção "1. Pesquisar oportunidades" com a instrução de copiar e colar em "2. Capturar lead"', () => {
    expect(html).toContain('1. Pesquisar oportunidades');
    expect(html).toContain('Pesquise, copie os dados encontrados e cole em');
    expect(html).toContain('pesquisa-lista');
  });

  test('gerarConsultasPesquisa() produz as 6 consultas esperadas, com "Abrir Maps" só onde faz sentido', () => {
    const sandbox = carregarScriptCliente();
    const consultas = sandbox.gerarConsultasPesquisa({
      produto: 'Sites e landing pages',
      nicho: 'Clínicas odontológicas',
      cidade: 'Lisboa',
    });

    expect(consultas.map(c => c.texto)).toEqual([
      'Clínicas odontológicas Lisboa',
      'Clínicas odontológicas Lisboa site',
      'Clínicas odontológicas Lisboa instagram',
      'Clínicas odontológicas Lisboa whatsapp',
      'Clínicas odontológicas Lisboa google maps',
      'Clínicas odontológicas Lisboa Sites e landing pages',
    ]);
    expect(consultas.map(c => c.maps)).toEqual([true, false, false, false, true, true]);
  });

  test('gerarConsultasPesquisa() nunca chama API externa nem depende de rede', () => {
    const sandbox = carregarScriptCliente();
    expect(typeof sandbox.gerarConsultasPesquisa).toBe('function');
    // Função pura: mesma campanha sempre produz a mesma lista, sem I/O.
    const campanha = { produto: 'X', nicho: 'Y', cidade: 'Z' };
    expect(sandbox.gerarConsultasPesquisa(campanha)).toEqual(sandbox.gerarConsultasPesquisa(campanha));
  });

  test('gerarConsultasPesquisa() ignora consultas que ficariam vazias', () => {
    const sandbox = carregarScriptCliente();
    const consultas = sandbox.gerarConsultasPesquisa({ produto: '', nicho: '', cidade: '' });
    expect(consultas).toEqual([]);
  });
});

describe('public/admin-radar.html — captura assistida', () => {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin-radar.html'),
    'utf8'
  );

  test('a UI inclui a seção "2. Capturar lead" com textarea, extrair prévia e prévia editável', () => {
    expect(html).toContain('2. Capturar lead');
    expect(html).toContain('captura-texto');
    expect(html).toContain('extrair-previa');
    expect(html).toContain('captura-previa');
    expect(html).toContain('salvar-captura');
    expect(html).toContain('captura-nomeEmpresa');
    expect(html).toContain('captura-cidade');
    expect(html).toContain('captura-pais');
    expect(html).toContain('captura-site');
    expect(html).toContain('captura-instagram');
    expect(html).toContain('captura-email');
    expect(html).toContain('captura-telefone');
    expect(html).toContain('captura-googleMapsUrl');
    expect(html).toContain('captura-observacoes');
  });

  // Mesma técnica usada para "pesquisa assistida": sem jsdom (nenhuma
  // dependência nova permitida), a lógica pura de extração é testada
  // executando o próprio <script> num sandbox `vm` com um `document` mínimo.
  function carregarScriptCliente() {
    const match = html.match(/<script>([\s\S]*?)<\/script>/);
    const code = match[1];

    function makeEl() {
      return {
        value: '', textContent: '', innerHTML: '', className: '', style: {}, dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener() {},
        appendChild() {},
        querySelector() { return makeEl(); },
        querySelectorAll() { return []; },
        closest() { return makeEl(); },
      };
    }

    const fakeDocument = {
      getElementById() { return makeEl(); },
      createElement() { return makeEl(); },
      addEventListener() {},
      querySelectorAll() { return []; },
    };

    const sandbox = {
      document: fakeDocument,
      window: {},
      navigator: { clipboard: { writeText: async () => {} } },
      fetch: async () => ({ ok: true, json: async () => ({ data: [], meta: { page: 1, limit: 20, total: 0 } }) }),
      console,
      URLSearchParams,
      setTimeout,
      alert: () => {},
    };

    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: 'admin-radar-script.js' });
    return sandbox;
  }

  test('extrairPreviaLead() detecta email', () => {
    const sandbox = carregarScriptCliente();
    const previa = sandbox.extrairPreviaLead('Clínica X\ncontato@clinicax.pt', {});
    expect(previa.email).toBe('contato@clinicax.pt');
  });

  test('extrairPreviaLead() detecta telefone', () => {
    const sandbox = carregarScriptCliente();
    const previa = sandbox.extrairPreviaLead('Clínica X\n+351 900 000 000', {});
    expect(previa.telefone).toBe('+351 900 000 000');
  });

  test('extrairPreviaLead() detecta site', () => {
    const sandbox = carregarScriptCliente();
    const previa = sandbox.extrairPreviaLead('Clínica X\nhttps://clinicax.pt', {});
    expect(previa.site).toBe('https://clinicax.pt');
  });

  test('extrairPreviaLead() detecta instagram por @usuario', () => {
    const sandbox = carregarScriptCliente();
    const previa = sandbox.extrairPreviaLead('Clínica X\n@clinicax', {});
    expect(previa.instagram).toBe('@clinicax');
  });

  test('extrairPreviaLead() detecta instagram por URL instagram.com/usuario', () => {
    const sandbox = carregarScriptCliente();
    const previa = sandbox.extrairPreviaLead('Clínica X\nhttps://www.instagram.com/clinicax/', {});
    expect(previa.instagram).toBe('@clinicax');
  });

  test('extrairPreviaLead() não confunde coordenadas de um link do Google Maps com telefone e preserva a URL inteira', () => {
    const sandbox = carregarScriptCliente();
    const previa = sandbox.extrairPreviaLead(
      'Clínica X\nhttps://www.google.com/maps/place/Clinica/@38.7223,-9.1393,15z',
      {}
    );
    expect(previa.googleMapsUrl).toBe('https://www.google.com/maps/place/Clinica/@38.7223,-9.1393,15z');
    expect(previa.telefone).toBe('');
  });

  test('extrairPreviaLead() preenche cidade com a campanha atual quando o texto colado não traz cidade', () => {
    const sandbox = carregarScriptCliente();
    const previa = sandbox.extrairPreviaLead('Clínica X', { cidade: 'Porto' });
    expect(previa.cidade).toBe('Porto');
    expect(previa.pais).toBe('');
  });

  test('extrairPreviaLead() usa a primeira linha não vazia como sugestão de nomeEmpresa', () => {
    const sandbox = carregarScriptCliente();
    const previa = sandbox.extrairPreviaLead('\n  Clínica Exemplo  \nRua Tal, 123', {});
    expect(previa.nomeEmpresa).toBe('Clínica Exemplo');
  });

  test('extrairPreviaLead() é uma função pura e nunca chama rede — colar/extrair não salva automaticamente', () => {
    const sandbox = carregarScriptCliente();
    let fetchChamado = false;
    sandbox.fetch = async (...args) => {
      fetchChamado = true;
      return { ok: true, json: async () => ({}) };
    };

    sandbox.extrairPreviaLead('Clínica X\ncontato@clinicax.pt\n+351 900 000 000', { cidade: 'Lisboa' });

    expect(fetchChamado).toBe(false);
  });
});

describe('public/admin-radar.html — exclusão com confirmação', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin-radar.html'),
    'utf8'
  );

  test('o card de lead tem botão "Excluir lead" com confirmação antes do DELETE', () => {
    expect(html).toContain('btn-excluir-lead');
    expect(html).toContain('Excluir lead');
    expect(html).toMatch(/btn-excluir-lead[\s\S]{0,400}confirm\(/);
  });

  test('o card de campanha tem botão "Excluir campanha" com dupla confirmação (confirm + prompt) antes do DELETE', () => {
    expect(html).toContain('btn-excluir-campanha');
    expect(html).toContain('Excluir campanha');
    expect(html).toMatch(/btn-excluir-campanha[\s\S]{0,600}confirm\([\s\S]{0,400}prompt\(/);
  });
});

describe('public/admin-radar.html — mensagem assistida', () => {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin-radar.html'),
    'utf8'
  );

  test('a UI inclui a seção "Mensagem assistida" com canal, gerar, textarea, salvar e copiar', () => {
    expect(html).toContain('Mensagem assistida');
    expect(html).toContain('campo-lead-mensagemCanal');
    expect(html).toContain('btn-gerar-mensagem');
    expect(html).toContain('campo-lead-mensagemGerada');
    expect(html).toContain('btn-salvar-mensagem');
    expect(html).toContain('btn-copiar-mensagem');
    expect(html).toContain('Gerar mensagem');
    expect(html).toContain('Salvar mensagem');
    expect(html).toContain('Copiar mensagem');
  });

  test('o botão "Copiar mensagem" usa clipboard e não faz chamada de rede nem salva automaticamente', () => {
    const match = html.match(/btn-copiar-mensagem'\)\.forEach\(btn => \{[\s\S]{0,600}?\}\);\n  \}\);/);
    expect(match).not.toBeNull();
    expect(match[0]).toContain('clipboard.writeText');
    expect(match[0]).not.toContain('fetch(');
  });

  // Mesma técnica usada para pesquisa/captura assistida: sem jsdom, a lógica
  // pura de geração de mensagem é testada executando o próprio <script> num
  // sandbox `vm` com um `document` mínimo.
  function carregarScriptCliente() {
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    const code = scriptMatch[1];

    function makeEl() {
      return {
        value: '', textContent: '', innerHTML: '', className: '', style: {}, dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener() {},
        appendChild() {},
        querySelector() { return makeEl(); },
        querySelectorAll() { return []; },
        closest() { return makeEl(); },
      };
    }

    const fakeDocument = {
      getElementById() { return makeEl(); },
      createElement() { return makeEl(); },
      addEventListener() {},
      querySelectorAll() { return []; },
    };

    const sandbox = {
      document: fakeDocument,
      window: {},
      navigator: { clipboard: { writeText: async () => {} } },
      fetch: async () => ({ ok: true, json: async () => ({ data: [], meta: { page: 1, limit: 20, total: 0 } }) }),
      console,
      URLSearchParams,
      setTimeout,
      alert: () => {},
    };

    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: 'admin-radar-script.js' });
    return sandbox;
  }

  test('gerarMensagemAssistida() usa nomeEmpresa, nicho/cidade, produtoRecomendado e problemasEncontrados sem inventar dado', () => {
    const sandbox = carregarScriptCliente();
    const mensagem = sandbox.gerarMensagemAssistida(
      {
        nomeEmpresa: 'Clínica Exemplo',
        nicho: 'Clínicas odontológicas',
        cidade: 'Lisboa',
        produtoRecomendado: 'Landing page',
        solucaoRecomendada: '',
        problemasEncontrados: ['não tem site'],
      },
      'whatsapp'
    );

    expect(mensagem).toContain('Clínica Exemplo');
    expect(mensagem).toContain('Clínicas odontológicas em Lisboa');
    expect(mensagem).toContain('não tem site');
    expect(mensagem).toContain('Landing page');
  });

  test('gerarMensagemAssistida() nunca inventa contexto quando nicho/cidade/problemas estão vazios', () => {
    const sandbox = carregarScriptCliente();
    const mensagem = sandbox.gerarMensagemAssistida(
      { nomeEmpresa: 'Clínica Vazia', nicho: '', cidade: '', produtoRecomendado: '', solucaoRecomendada: '', problemasEncontrados: [] },
      'manual'
    );

    expect(mensagem).not.toMatch(/pesquisando sobre/);
    expect(mensagem).not.toMatch(/notei que/);
  });

  test('gerarMensagemAssistida() adapta o fechamento por canal', () => {
    const sandbox = carregarScriptCliente();
    const lead = { nomeEmpresa: 'X', nicho: '', cidade: '', produtoRecomendado: '', solucaoRecomendada: '', problemasEncontrados: [] };

    const whatsapp = sandbox.gerarMensagemAssistida(lead, 'whatsapp');
    const email = sandbox.gerarMensagemAssistida(lead, 'email');

    expect(whatsapp).not.toBe(email);
  });

  test('gerarMensagemAssistida() é uma função pura e nunca chama rede', () => {
    const sandbox = carregarScriptCliente();
    let fetchChamado = false;
    sandbox.fetch = async () => { fetchChamado = true; return { ok: true, json: async () => ({}) }; };

    sandbox.gerarMensagemAssistida(
      { nomeEmpresa: 'X', nicho: 'Y', cidade: 'Z', produtoRecomendado: '', solucaoRecomendada: '', problemasEncontrados: [] },
      'whatsapp'
    );

    expect(fetchChamado).toBe(false);
  });
});

describe('public/admin-radar.html — reorganização do fluxo (UX operacional)', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin-radar.html'),
    'utf8'
  );

  test('os três blocos principais aparecem na ordem 1 → 2 → 3', () => {
    const idxPesquisar = html.indexOf('1. Pesquisar oportunidades');
    const idxCapturar = html.indexOf('2. Capturar lead');
    const idxLeads = html.indexOf('3. Leads capturados');

    expect(idxPesquisar).toBeGreaterThan(-1);
    expect(idxCapturar).toBeGreaterThan(-1);
    expect(idxLeads).toBeGreaterThan(-1);
    expect(idxPesquisar).toBeLessThan(idxCapturar);
    expect(idxCapturar).toBeLessThan(idxLeads);
  });

  test('"Importar leads em lote" continua presente, rebaixado para "Avançado"', () => {
    expect(html).toContain('Avançado: importar lista em lote');
    // Funcionalidade intacta: mesmos ids/textarea/botão de sempre.
    expect(html).toContain('import-leads-texto');
    expect(html).toContain('id="importar-leads"');
    expect(html).toContain('>Importar leads<');
  });

  test('"Novo lead manual" continua presente, rebaixado para "Avançado"', () => {
    expect(html).toContain('Avançado: criar lead manual');
    // Funcionalidade intacta: mesmos ids/campos/botão de sempre.
    expect(html).toContain('novo-lead-nomeEmpresa');
    expect(html).toContain('id="criar-lead"');
    expect(html).toContain('>Criar lead<');
  });

  test('o bloco "Avançado" é recolhível (reaproveita o toggle genérico já existente) e vem antes de "3. Leads capturados"', () => {
    const idxAvancado = html.indexOf('id="avancado-toggle"');
    const idxLeads = html.indexOf('3. Leads capturados');

    expect(idxAvancado).toBeGreaterThan(-1);
    expect(idxAvancado).toBeLessThan(idxLeads);
    expect(html).toMatch(/avancado-toggle[\s\S]{0,300}analise-body/);
  });

  test('nenhuma funcionalidade foi removida: pesquisa assistida, captura assistida, análise do lead e mensagem assistida continuam presentes', () => {
    expect(html).toContain('pesquisa-lista');
    expect(html).toContain('gerarConsultasPesquisa');
    expect(html).toContain('captura-previa');
    expect(html).toContain('extrairPreviaLead');
    expect(html).toContain('Análise do lead');
    expect(html).toContain('campo-analise');
    expect(html).toContain('Mensagem assistida');
    expect(html).toContain('gerarMensagemAssistida');
    expect(html).toContain('btn-excluir-lead');
    expect(html).toContain('btn-excluir-campanha');
  });

  test('o toggle "Avançado" é vinculado uma única vez fora de bindEventsLeads — não acumula listener a cada renderLeads()', () => {
    // Regressão: o binding genérico de `.analise-toggle` dentro de bindEventsLeads()
    // deve estar escopado a #leads-grid, nunca ao document inteiro, para não
    // re-anexar um listener no botão estático "Avançado" a cada recarregamento
    // da lista de leads (o que faria o toggle parecer "travado" de forma intermitente).
    expect(html).toMatch(/leadsGrid\.querySelectorAll\('\.analise-toggle'\)/);
    expect(html).not.toMatch(/document\.querySelectorAll\('\.analise-toggle'\)/);
  });
});

describe('public/admin-radar.html — busca automática (Corte 13, provider mockado)', () => {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin-radar.html'),
    'utf8'
  );

  test('o bloco "1. Pesquisar oportunidades" tem o botão "Buscar oportunidades" e o aviso de busca mockada', () => {
    expect(html).toContain('id="buscar-oportunidades"');
    expect(html).toContain('Buscar oportunidades');
    expect(html).toMatch(/Busca mockada para validar o fluxo\. Integra[çc][ãa]o real vem depois\./);
    expect(html).toContain('busca-resultado');
    expect(html).toContain('busca-grid');
  });

  test('cada card de sugestão tem "Salvar como lead" e "Descartar"', () => {
    expect(html).toContain('btn-salvar-sugestao');
    expect(html).toContain('Salvar como lead');
    expect(html).toContain('btn-descartar-sugestao');
    expect(html).toContain('>Descartar<');
  });

  test('sugestão duplicada é sinalizada visualmente ("já existe nesta campanha")', () => {
    expect(html).toMatch(/duplicado[\s\S]{0,200}Já existe nesta campanha/);
  });

  test('"Salvar como lead" usa o endpoint de criação de lead já existente (POST .../leads), não um endpoint novo', () => {
    const idxHandler = html.indexOf("querySelectorAll('.btn-salvar-sugestao')");
    const idxNovaFuncao = html.indexOf("querySelectorAll('.btn-descartar-sugestao')");

    expect(idxHandler).toBeGreaterThan(-1);
    expect(idxNovaFuncao).toBeGreaterThan(idxHandler);

    const trecho = html.slice(idxHandler, idxNovaFuncao);
    expect(trecho).toContain('${campanhaAtual.id}/leads`');
    expect(trecho).toContain("method: 'POST'");
    expect(trecho).not.toContain('/search`');
  });

  test('a busca nunca remove pesquisa assistida, captura assistida, Avançado, análise do lead ou mensagem assistida', () => {
    expect(html).toContain('pesquisa-lista');
    expect(html).toContain('gerarConsultasPesquisa');
    expect(html).toContain('captura-previa');
    expect(html).toContain('extrairPreviaLead');
    expect(html).toContain('id="avancado-toggle"');
    expect(html).toContain('Avançado: importar lista em lote');
    expect(html).toContain('Avançado: criar lead manual');
    expect(html).toContain('Análise do lead');
    expect(html).toContain('campo-analise');
    expect(html).toContain('Mensagem assistida');
    expect(html).toContain('gerarMensagemAssistida');
  });

  // Mesma técnica usada nas demais seções assistidas: sem jsdom, o próprio
  // <script> é executado num sandbox `vm` com um `document` mínimo para
  // confirmar que o botão "Buscar oportunidades" é vinculado uma única vez,
  // fora de qualquer função de re-render (mesma disciplina aplicada ao
  // toggle "Avançado" no Corte 12, para não acumular listener).
  function carregarScriptCliente() {
    const match = html.match(/<script>([\s\S]*?)<\/script>/);
    const code = match[1];

    function makeEl() {
      return {
        value: '', textContent: '', innerHTML: '', className: '', style: {}, dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener() {},
        appendChild() {},
        querySelector() { return makeEl(); },
        querySelectorAll() { return []; },
        closest() { return makeEl(); },
      };
    }

    const fakeDocument = {
      getElementById() { return makeEl(); },
      createElement() { return makeEl(); },
      addEventListener() {},
      querySelectorAll() { return []; },
    };

    const sandbox = {
      document: fakeDocument,
      window: {},
      navigator: { clipboard: { writeText: async () => {} } },
      fetch: async () => ({ ok: true, json: async () => ({ data: { sugestoes: [] } }) }),
      console,
      URLSearchParams,
      setTimeout,
      alert: () => {},
    };

    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: 'admin-radar-script.js' });
    return sandbox;
  }

  test('o script carrega sem erro e expõe renderSugestoesBusca/bindEventsBusca', () => {
    const sandbox = carregarScriptCliente();
    expect(typeof sandbox.renderSugestoesBusca).toBe('function');
    expect(typeof sandbox.bindEventsBusca).toBe('function');
  });

  test('o binding do botão "buscar-oportunidades" é feito uma única vez, fora de bindEventsBusca (função fechada antes dele)', () => {
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const bindingTexto = "document.getElementById('buscar-oportunidades')";
    const idxFuncao = scriptMatch.indexOf('function bindEventsBusca()');
    const idxBinding = scriptMatch.indexOf(bindingTexto);

    expect(idxFuncao).toBeGreaterThan(-1);
    expect(idxBinding).toBeGreaterThan(idxFuncao);

    // Entre o fim do corpo de bindEventsBusca (chave de fechamento na coluna 0,
    // seguida de linha em branco) e o binding do botão, não deve haver nenhuma
    // outra abertura de função — ou seja, o binding acontece direto no
    // top-level do script, igual a 'avancado-toggle'/'criar-lead'/'importar-leads'.
    const trecho = scriptMatch.slice(idxFuncao, idxBinding + bindingTexto.length);
    expect(trecho).toMatch(/\n\}\n\ndocument\.getElementById\('buscar-oportunidades'\)$/);
  });
});
