process.env.ADMIN_KEY = 'test-key';

require('./setup');

const request = require('supertest');
const app = require('../app');
const { notifyNewDiagnostic } = require('../src/services/notificationService');
const { maskIp } = require('../src/routes/diagnosticRoutes');

const AUTH = { 'x-admin-key': 'test-key' };

function payloadBase(overrides = {}) {
  return {
    nomeEmpresa: 'Empresa Teste',
    contato: 'teste@email.com',
    categorias: ['automacoes'],
    descricaoBreve: 'Queremos automatizar o atendimento inicial.',
    ...overrides,
  };
}

async function criarLead(overrides = {}) {
  const res = await request(app).post('/api/diagnostics').send(payloadBase(overrides));
  return res.body.data;
}

describe('POST /api/diagnostics', () => {
  test('cria lead com categoria válida', async () => {
    const res = await request(app).post('/api/diagnostics').send(payloadBase());

    expect(res.status).toBe(201);
    expect(res.body.data.nomeEmpresa).toBe('Empresa Teste');
    expect(res.body.data.categorias).toEqual(['automacoes']);
  });

  test('status default é "novo"', async () => {
    const res = await request(app).post('/api/diagnostics').send(payloadBase());
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('novo');
  });

  test('notaInterna default é string vazia', async () => {
    const res = await request(app).post('/api/diagnostics').send(payloadBase());
    expect(res.status).toBe(201);
    expect(res.body.data.notaInterna).toBe('');
  });

  test('prioridade default é "media"', async () => {
    const res = await request(app).post('/api/diagnostics').send(payloadBase());
    expect(res.status).toBe(201);
    expect(res.body.data.prioridade).toBe('media');
  });

  test('origem default é "diagnostico"', async () => {
    const res = await request(app).post('/api/diagnostics').send(payloadBase());
    expect(res.status).toBe(201);
    expect(res.body.data.origem).toBe('diagnostico');
  });

  test('propostaRascunho default é string vazia', async () => {
    const res = await request(app).post('/api/diagnostics').send(payloadBase());
    expect(res.status).toBe(201);
    expect(res.body.data.propostaRascunho).toBe('');
  });

  test('não exige admin key (rota pública)', async () => {
    const res = await request(app).post('/api/diagnostics').send(payloadBase());
    expect(res.status).toBe(201);
  });

  test('aceita múltiplas categorias, incluindo sites_landing_pages', async () => {
    const res = await request(app)
      .post('/api/diagnostics')
      .send(payloadBase({ categorias: ['sites_landing_pages', 'automacoes'] }));

    expect(res.status).toBe(201);
    expect(res.body.data.categorias).toEqual(['sites_landing_pages', 'automacoes']);
  });

  test('aceita "ainda_nao_sei" sozinha', async () => {
    const res = await request(app)
      .post('/api/diagnostics')
      .send(payloadBase({ categorias: ['ainda_nao_sei'] }));

    expect(res.status).toBe(201);
  });

  test('rejeita somente sites_landing_pages e orienta para /', async () => {
    const res = await request(app)
      .post('/api/diagnostics')
      .send(payloadBase({ categorias: ['sites_landing_pages'] }));

    expect(res.status).toBe(400);
    expect(res.body.redirectTo).toBe('/');
  });

  test('rejeita sem nomeEmpresa', async () => {
    const res = await request(app)
      .post('/api/diagnostics')
      .send(payloadBase({ nomeEmpresa: undefined }));

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Dados inválidos');
  });

  test('rejeita sem contato', async () => {
    const res = await request(app)
      .post('/api/diagnostics')
      .send(payloadBase({ contato: undefined }));

    expect(res.status).toBe(400);
  });

  test('rejeita sem descricaoBreve', async () => {
    const res = await request(app)
      .post('/api/diagnostics')
      .send(payloadBase({ descricaoBreve: undefined }));

    expect(res.status).toBe(400);
  });

  test('rejeita categorias vazio', async () => {
    const res = await request(app)
      .post('/api/diagnostics')
      .send(payloadBase({ categorias: [] }));

    expect(res.status).toBe(400);
  });

  test('rejeita categorias duplicadas', async () => {
    const res = await request(app)
      .post('/api/diagnostics')
      .send(payloadBase({ categorias: ['automacoes', 'automacoes'] }));

    expect(res.status).toBe(400);
  });

  test('rejeita mais de 6 categorias', async () => {
    const res = await request(app)
      .post('/api/diagnostics')
      .send(
        payloadBase({
          categorias: [
            'sistemas_agentes_ia',
            'sites_landing_pages',
            'automacoes',
            'saas_produtos_digitais',
            'apis_integracoes',
            'ainda_nao_sei',
            'automacoes',
          ],
        })
      );

    expect(res.status).toBe(400);
  });

  test('aceita as 6 categorias únicas simultaneamente', async () => {
    const res = await request(app)
      .post('/api/diagnostics')
      .send(
        payloadBase({
          categorias: [
            'sistemas_agentes_ia',
            'sites_landing_pages',
            'automacoes',
            'saas_produtos_digitais',
            'apis_integracoes',
            'ainda_nao_sei',
          ],
        })
      );

    expect(res.status).toBe(201);
    expect(res.body.data.categorias).toHaveLength(6);
  });

  test('rejeita categoria fora do enum oficial', async () => {
    const res = await request(app)
      .post('/api/diagnostics')
      .send(payloadBase({ categorias: ['redes_sociais_conteudo'] }));

    expect(res.status).toBe(400);
  });

  test('aceita estagioAtual e urgencia opcionais', async () => {
    const res = await request(app)
      .post('/api/diagnostics')
      .send(payloadBase({ estagioAtual: 'Ideia inicial', urgencia: 'Este mês' }));

    expect(res.status).toBe(201);
    expect(res.body.data.estagioAtual).toBe('Ideia inicial');
    expect(res.body.data.urgencia).toBe('Este mês');
  });
});

describe('GET /api/diagnostics (admin)', () => {
  test('401 sem header x-admin-key', async () => {
    const res = await request(app).get('/api/diagnostics');
    expect(res.status).toBe(401);
  });

  test('200 com chave correta, lista vazia quando não há leads', async () => {
    const res = await request(app).get('/api/diagnostics').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  test('retorna leads criados com meta de paginação', async () => {
    await criarLead({ nomeEmpresa: 'Lead A' });
    await criarLead({ nomeEmpresa: 'Lead B' });

    const res = await request(app).get('/api/diagnostics').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(2);
  });

  test('filtra por status', async () => {
    const lead = await criarLead({ nomeEmpresa: 'Lead Ganho' });
    await request(app)
      .patch(`/api/diagnostics/${lead._id}/status`)
      .set(AUTH)
      .send({ status: 'ganho' });
    await criarLead({ nomeEmpresa: 'Lead Novo' });

    const res = await request(app).get('/api/diagnostics?status=ganho').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('ganho');
  });

  test('filtra por categoria', async () => {
    await criarLead({ nomeEmpresa: 'Lead Automacoes', categorias: ['automacoes'] });
    await criarLead({ nomeEmpresa: 'Lead APIs', categorias: ['apis_integracoes'] });

    const res = await request(app).get('/api/diagnostics?categoria=automacoes').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].categorias).toContain('automacoes');
  });

  test('combina filtros de status e categoria', async () => {
    const alvo = await criarLead({ nomeEmpresa: 'Alvo', categorias: ['automacoes'] });
    await request(app)
      .patch(`/api/diagnostics/${alvo._id}/status`)
      .set(AUTH)
      .send({ status: 'proposta' });

    await criarLead({ nomeEmpresa: 'Mesma categoria, status novo', categorias: ['automacoes'] });
    await criarLead({ nomeEmpresa: 'Outra categoria', categorias: ['apis_integracoes'] });

    const res = await request(app)
      .get('/api/diagnostics?status=proposta&categoria=automacoes')
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]._id).toBe(alvo._id);
  });

  test('status inválido no filtro retorna 400', async () => {
    const res = await request(app).get('/api/diagnostics?status=status_que_nao_existe').set(AUTH);
    expect(res.status).toBe(400);
  });

  test('categoria inválida no filtro retorna 400', async () => {
    const res = await request(app).get('/api/diagnostics?categoria=categoria_que_nao_existe').set(AUTH);
    expect(res.status).toBe(400);
  });

  test('filtra por origem', async () => {
    await criarLead({ nomeEmpresa: 'Lead origem diagnostico' });

    const res = await request(app).get('/api/diagnostics?origem=diagnostico').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].origem).toBe('diagnostico');
  });

  test('origem inválida no filtro retorna 400', async () => {
    const res = await request(app).get('/api/diagnostics?origem=origem_que_nao_existe').set(AUTH);
    expect(res.status).toBe(400);
  });

  test('combina origem com status e categoria', async () => {
    const alvo = await criarLead({ nomeEmpresa: 'Alvo', categorias: ['automacoes'] });
    await request(app)
      .patch(`/api/diagnostics/${alvo._id}/status`)
      .set(AUTH)
      .send({ status: 'proposta' });

    await criarLead({ nomeEmpresa: 'Outra categoria', categorias: ['apis_integracoes'] });

    const res = await request(app)
      .get('/api/diagnostics?origem=diagnostico&status=proposta&categoria=automacoes')
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]._id).toBe(alvo._id);
  });

  test('paginação continua funcionando combinada com origem', async () => {
    await criarLead({ nomeEmpresa: 'A' });
    await criarLead({ nomeEmpresa: 'B' });
    await criarLead({ nomeEmpresa: 'C' });

    const res = await request(app)
      .get('/api/diagnostics?origem=diagnostico&limit=2')
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(3);
  });

  test('paginação continua funcionando combinada com filtro', async () => {
    await criarLead({ nomeEmpresa: 'A', categorias: ['automacoes'] });
    await criarLead({ nomeEmpresa: 'B', categorias: ['automacoes'] });
    await criarLead({ nomeEmpresa: 'C', categorias: ['automacoes'] });

    const res = await request(app)
      .get('/api/diagnostics?categoria=automacoes&limit=2')
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(3);
  });
});

describe('GET /api/diagnostics/:id', () => {
  test('401 sem admin key', async () => {
    const lead = await criarLead();
    const res = await request(app).get(`/api/diagnostics/${lead._id}`);
    expect(res.status).toBe(401);
  });

  test('200 retorna lead existente', async () => {
    const lead = await criarLead();
    const res = await request(app).get(`/api/diagnostics/${lead._id}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(lead._id);
  });

  test('404 para id válido inexistente', async () => {
    const res = await request(app)
      .get('/api/diagnostics/000000000000000000000000')
      .set(AUTH);
    expect(res.status).toBe(404);
  });

  test('400 para id malformado', async () => {
    const res = await request(app).get('/api/diagnostics/id-invalido').set(AUTH);
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/diagnostics/:id/status', () => {
  test('401 sem admin key', async () => {
    const lead = await criarLead();
    const res = await request(app)
      .patch(`/api/diagnostics/${lead._id}/status`)
      .send({ status: 'em_analise' });
    expect(res.status).toBe(401);
  });

  test('200 com status válido e altera o status', async () => {
    const lead = await criarLead();
    const res = await request(app)
      .patch(`/api/diagnostics/${lead._id}/status`)
      .set(AUTH)
      .send({ status: 'em_analise' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('em_analise');

    const get = await request(app).get(`/api/diagnostics/${lead._id}`).set(AUTH);
    expect(get.body.data.status).toBe('em_analise');
  });

  test('400 para status inválido', async () => {
    const lead = await criarLead();
    const res = await request(app)
      .patch(`/api/diagnostics/${lead._id}/status`)
      .set(AUTH)
      .send({ status: 'status_que_nao_existe' });

    expect(res.status).toBe(400);
    expect(res.body.error.allowed).toContain('novo');
  });

  test('404 para id inexistente', async () => {
    const res = await request(app)
      .patch('/api/diagnostics/000000000000000000000000/status')
      .set(AUTH)
      .send({ status: 'ganho' });

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/diagnostics/:id/note', () => {
  test('401 sem admin key', async () => {
    const lead = await criarLead();
    const res = await request(app)
      .patch(`/api/diagnostics/${lead._id}/note`)
      .send({ notaInterna: 'Nota de teste' });
    expect(res.status).toBe(401);
  });

  test('200 com nota válida e altera notaInterna', async () => {
    const lead = await criarLead();
    const res = await request(app)
      .patch(`/api/diagnostics/${lead._id}/note`)
      .set(AUTH)
      .send({ notaInterna: 'Cliente pediu retorno na próxima semana.' });

    expect(res.status).toBe(200);
    expect(res.body.data.notaInterna).toBe('Cliente pediu retorno na próxima semana.');

    const get = await request(app).get(`/api/diagnostics/${lead._id}`).set(AUTH);
    expect(get.body.data.notaInterna).toBe('Cliente pediu retorno na próxima semana.');
  });

  test('400 para nota maior que 2000 caracteres', async () => {
    const lead = await criarLead();
    const res = await request(app)
      .patch(`/api/diagnostics/${lead._id}/note`)
      .set(AUTH)
      .send({ notaInterna: 'a'.repeat(2001) });

    expect(res.status).toBe(400);
  });

  test('404 para id inexistente', async () => {
    const res = await request(app)
      .patch('/api/diagnostics/000000000000000000000000/note')
      .set(AUTH)
      .send({ notaInterna: 'qualquer coisa' });

    expect(res.status).toBe(404);
  });

  test('log de auditoria não contém o texto da nota', async () => {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const lead = await criarLead();

    await request(app)
      .patch(`/api/diagnostics/${lead._id}/note`)
      .set(AUTH)
      .send({ notaInterna: 'TEXTO_SIGILOSO_QUE_NAO_PODE_VAZAR' });

    expect(spy).toHaveBeenCalledTimes(1);
    const logged = spy.mock.calls[0][0];
    expect(logged).toContain('[audit]');
    expect(logged).toContain('diagnostic_lead_note_updated');
    expect(logged).not.toContain('TEXTO_SIGILOSO_QUE_NAO_PODE_VAZAR');

    spy.mockRestore();
  });
});

describe('PATCH /api/diagnostics/:id/priority', () => {
  test('401 sem admin key', async () => {
    const lead = await criarLead();
    const res = await request(app)
      .patch(`/api/diagnostics/${lead._id}/priority`)
      .send({ prioridade: 'alta' });
    expect(res.status).toBe(401);
  });

  test('200 com prioridade válida e altera a prioridade', async () => {
    const lead = await criarLead();
    const res = await request(app)
      .patch(`/api/diagnostics/${lead._id}/priority`)
      .set(AUTH)
      .send({ prioridade: 'alta' });

    expect(res.status).toBe(200);
    expect(res.body.data.prioridade).toBe('alta');

    const get = await request(app).get(`/api/diagnostics/${lead._id}`).set(AUTH);
    expect(get.body.data.prioridade).toBe('alta');
  });

  test('400 para prioridade inválida', async () => {
    const lead = await criarLead();
    const res = await request(app)
      .patch(`/api/diagnostics/${lead._id}/priority`)
      .set(AUTH)
      .send({ prioridade: 'urgentissima' });

    expect(res.status).toBe(400);
    expect(res.body.error.allowed).toContain('media');
  });

  test('404 para id inexistente', async () => {
    const res = await request(app)
      .patch('/api/diagnostics/000000000000000000000000/priority')
      .set(AUTH)
      .send({ prioridade: 'baixa' });

    expect(res.status).toBe(404);
  });

  test('log de auditoria registra from/to sem PII', async () => {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const lead = await criarLead();

    await request(app)
      .patch(`/api/diagnostics/${lead._id}/priority`)
      .set(AUTH)
      .send({ prioridade: 'alta' });

    expect(spy).toHaveBeenCalledTimes(1);
    const logged = spy.mock.calls[0][0];
    expect(logged).toContain('[audit]');
    expect(logged).toContain('diagnostic_lead_priority_updated');
    expect(logged).toContain('"from":"media"');
    expect(logged).toContain('"to":"alta"');

    spy.mockRestore();
  });
});

describe('PATCH /api/diagnostics/:id/proposal-draft', () => {
  test('401 sem admin key', async () => {
    const lead = await criarLead();
    const res = await request(app)
      .patch(`/api/diagnostics/${lead._id}/proposal-draft`)
      .send({ propostaRascunho: 'Rascunho de teste' });
    expect(res.status).toBe(401);
  });

  test('200 com rascunho válido e altera propostaRascunho', async () => {
    const lead = await criarLead();
    const res = await request(app)
      .patch(`/api/diagnostics/${lead._id}/proposal-draft`)
      .set(AUTH)
      .send({ propostaRascunho: 'Escopo: site institucional com 5 páginas. Faixa: 300-400€, a confirmar.' });

    expect(res.status).toBe(200);
    expect(res.body.data.propostaRascunho).toBe(
      'Escopo: site institucional com 5 páginas. Faixa: 300-400€, a confirmar.'
    );

    const get = await request(app).get(`/api/diagnostics/${lead._id}`).set(AUTH);
    expect(get.body.data.propostaRascunho).toBe(
      'Escopo: site institucional com 5 páginas. Faixa: 300-400€, a confirmar.'
    );
  });

  test('400 para rascunho maior que 5000 caracteres', async () => {
    const lead = await criarLead();
    const res = await request(app)
      .patch(`/api/diagnostics/${lead._id}/proposal-draft`)
      .set(AUTH)
      .send({ propostaRascunho: 'a'.repeat(5001) });

    expect(res.status).toBe(400);
  });

  test('404 para id inexistente', async () => {
    const res = await request(app)
      .patch('/api/diagnostics/000000000000000000000000/proposal-draft')
      .set(AUTH)
      .send({ propostaRascunho: 'qualquer coisa' });

    expect(res.status).toBe(404);
  });

  test('log de auditoria não contém o texto da proposta', async () => {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const lead = await criarLead();

    await request(app)
      .patch(`/api/diagnostics/${lead._id}/proposal-draft`)
      .set(AUTH)
      .send({ propostaRascunho: 'TEXTO_SIGILOSO_DA_PROPOSTA_QUE_NAO_PODE_VAZAR' });

    expect(spy).toHaveBeenCalledTimes(1);
    const logged = spy.mock.calls[0][0];
    expect(logged).toContain('[audit]');
    expect(logged).toContain('diagnostic_lead_proposal_draft_updated');
    expect(logged).not.toContain('TEXTO_SIGILOSO_DA_PROPOSTA_QUE_NAO_PODE_VAZAR');

    spy.mockRestore();
  });
});

describe('DELETE /api/diagnostics/:id', () => {
  test('401 sem admin key', async () => {
    const lead = await criarLead();
    const res = await request(app).delete(`/api/diagnostics/${lead._id}`);
    expect(res.status).toBe(401);
  });

  test('remove lead existente e confirma via GET subsequente (404)', async () => {
    const lead = await criarLead();
    const del = await request(app).delete(`/api/diagnostics/${lead._id}`).set(AUTH);
    expect(del.status).toBe(200);
    expect(del.body.data._id).toBe(lead._id);

    const get = await request(app).get(`/api/diagnostics/${lead._id}`).set(AUTH);
    expect(get.status).toBe(404);
  });

  test('404 para id inexistente', async () => {
    const res = await request(app)
      .delete('/api/diagnostics/000000000000000000000000')
      .set(AUTH);
    expect(res.status).toBe(404);
  });

  test('registra log de auditoria ao remover um lead existente', async () => {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const lead = await criarLead();

    await request(app).delete(`/api/diagnostics/${lead._id}`).set(AUTH);

    expect(spy).toHaveBeenCalledTimes(1);
    const logged = spy.mock.calls[0][0];
    expect(logged).toContain('[audit]');
    expect(logged).toContain('diagnostic_lead_deleted');
    expect(logged).toContain(lead._id);

    spy.mockRestore();
  });

  test('log de remoção não contém contato nem descricaoBreve', async () => {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const lead = await criarLead({
      contato: 'segredo@naopodeaparecer.com',
      descricaoBreve: 'TEXTO_QUE_NAO_PODE_VAZAR_NO_LOG',
    });

    await request(app).delete(`/api/diagnostics/${lead._id}`).set(AUTH);

    const logged = spy.mock.calls[0][0];
    expect(logged).not.toContain('segredo@naopodeaparecer.com');
    expect(logged).not.toContain('TEXTO_QUE_NAO_PODE_VAZAR_NO_LOG');

    spy.mockRestore();
  });

  test('não loga nada quando o id não existe (404)', async () => {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => {});

    await request(app)
      .delete('/api/diagnostics/000000000000000000000000')
      .set(AUTH);

    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });
});

describe('maskIp (auditoria)', () => {
  test('mascara IPv4 normal', () => {
    expect(maskIp('203.0.113.42')).toBe('203.0.113.xxx');
  });

  test('mascara IPv4 mapeado em IPv6', () => {
    expect(maskIp('::ffff:127.0.0.1')).toBe('::ffff:127.0.0.xxx');
  });

  test('IPv6 genérico não retorna o endereço completo', () => {
    const original = '2001:db8::1';
    const masked = maskIp(original);
    expect(masked).not.toBe(original);
    expect(masked).not.toContain(original);
  });

  test('retorna null para vazio/null', () => {
    expect(maskIp(null)).toBeNull();
    expect(maskIp('')).toBeNull();
  });
});

describe('notifyNewDiagnostic — sem Telegram real nesta etapa', () => {
  test('retorna not_configured quando TELEGRAM_BOT_TOKEN/CHAT_ID não estão definidos', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    const resultado = await notifyNewDiagnostic({
      nomeEmpresa: 'Empresa Teste',
      contato: 'teste@email.com',
      categorias: ['automacoes'],
      descricaoBreve: 'Teste',
    });

    expect(resultado).toEqual({ sent: false, reason: 'not_configured' });
  });
});

describe('GET /diagnostico', () => {
  test('serve a página estática', async () => {
    const res = await request(app).get('/diagnostico');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Diagnóstico rápido');
  });
});
