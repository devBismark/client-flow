require('./setup');

const request = require('supertest');
const app = require('../app');
const { notifyNewDiagnostic } = require('../src/services/notificationService');

function payloadBase(overrides = {}) {
  return {
    nomeEmpresa: 'Empresa Teste',
    contato: 'teste@email.com',
    categorias: ['automacoes'],
    descricaoBreve: 'Queremos automatizar o atendimento inicial.',
    ...overrides,
  };
}

describe('POST /api/diagnostics', () => {
  test('cria lead com categoria válida', async () => {
    const res = await request(app).post('/api/diagnostics').send(payloadBase());

    expect(res.status).toBe(201);
    expect(res.body.data.nomeEmpresa).toBe('Empresa Teste');
    expect(res.body.data.categorias).toEqual(['automacoes']);
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
