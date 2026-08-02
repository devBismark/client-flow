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

describe('DELETE /api/projects/:id', () => {
  test('401 sem admin key', async () => {
    const projeto = await criarProjeto();
    const res = await request(app).delete(`/api/projects/${projeto._id}`);
    expect(res.status).toBe(401);
  });

  test('remove projeto existente e confirma via GET subsequente (404)', async () => {
    const projeto = await criarProjeto();
    const del = await request(app).delete(`/api/projects/${projeto._id}`).set(AUTH);
    expect(del.status).toBe(200);
    expect(del.body.data._id).toBe(projeto._id);

    const get = await request(app).get(`/api/projects/${projeto._id}`).set(AUTH);
    expect(get.status).toBe(404);
  });

  test('404 para id inexistente', async () => {
    const res = await request(app)
      .delete('/api/projects/000000000000000000000000')
      .set(AUTH);
    expect(res.status).toBe(404);
  });

  test('registra log de auditoria ao remover um projeto existente', async () => {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const projeto = await criarProjeto();

    await request(app).delete(`/api/projects/${projeto._id}`).set(AUTH);

    expect(spy).toHaveBeenCalledTimes(1);
    const logged = spy.mock.calls[0][0];
    expect(logged).toContain('[audit]');
    expect(logged).toContain('project_deleted');
    expect(logged).toContain(projeto._id);

    spy.mockRestore();
  });

  test('log de remoção não contém clientName nem clientContact', async () => {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const projeto = await criarProjeto({
      clientName: 'NOME_QUE_NAO_PODE_VAZAR_NO_LOG',
      clientContact: 'segredo@naopodeaparecer.com',
    });

    await request(app).delete(`/api/projects/${projeto._id}`).set(AUTH);

    const logged = spy.mock.calls[0][0];
    expect(logged).not.toContain('NOME_QUE_NAO_PODE_VAZAR_NO_LOG');
    expect(logged).not.toContain('segredo@naopodeaparecer.com');

    spy.mockRestore();
  });

  test('não loga nada quando o id não existe (404)', async () => {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => {});

    await request(app)
      .delete('/api/projects/000000000000000000000000')
      .set(AUTH);

    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });
});

describe('public/admin.html — botão "Copiar mensagem"', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin.html'),
    'utf8'
  );

  test('o card tem botão "Copiar mensagem" com o token da proposta', () => {
    expect(html).toContain('copy-message');
    expect(html).toContain('Copiar mensagem');
    expect(html).toMatch(/copy-message[^>]*data-token="\$\{p\.proposalToken\}"/);
  });

  test('a mensagem copiada reaproveita o link público da proposta, sem preço/prazo/notas', () => {
    expect(html).toMatch(/copyMessageBtn[\s\S]{0,400}proposta\.html\?t=\$\{copyMessageBtn\.dataset\.token\}/);
    expect(html).not.toMatch(/mensagem[\s\S]{0,400}p\.notes/);
  });
});

describe('public/admin.html — botão "Copiar link" (correção do bug pré-existente)', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin.html'),
    'utf8'
  );

  test('o rótulo do botão é "Copiar link", não "Copiarlink"', () => {
    expect(html).toContain('>Copiar link</button>');
    expect(html).not.toContain('>Copiarlink</button>');
  });

  test('o handler de .copy-link está dentro do card (bindEvents), não anexado no topo do script antes de qualquer card existir', () => {
    expect(html).toContain("card.querySelector('.copy-link')");
    expect(html).not.toMatch(/document\.querySelectorAll\('\.copy-link'\)/);
  });

  test('o handler copia o mesmo link público já usado por "Ver proposta"', () => {
    expect(html).toMatch(/copyLinkBtn[\s\S]{0,300}proposta\.html\?t=\$\{copyLinkBtn\.dataset\.token\}/);
  });
});

describe('public/admin.html — botões "Copiar follow-up 1"/"Copiar follow-up 2"', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin.html'),
    'utf8'
  );

  test('os dois botões só são renderizados quando o status é "orcamento_enviado"', () => {
    expect(html).toMatch(/p\.status === 'orcamento_enviado'[\s\S]{0,80}copy-followup1/);
    expect(html).toMatch(/p\.status === 'orcamento_enviado'[\s\S]{0,80}copy-followup2/);
  });

  test('os handlers copiam o link público da proposta, sem gravar nada no banco', () => {
    const handler1 = html.match(/copyFollowup1Btn\.addEventListener\('click', async \(\) => \{[\s\S]*?\}\);/)[0];
    const handler2 = html.match(/copyFollowup2Btn\.addEventListener\('click', async \(\) => \{[\s\S]*?\}\);/)[0];

    expect(handler1).toContain('proposta.html?t=${copyFollowup1Btn.dataset.token}');
    expect(handler2).toContain('proposta.html?t=${copyFollowup2Btn.dataset.token}');
    expect(handler1).not.toContain('fetch(');
    expect(handler2).not.toContain('fetch(');
  });

  test('nenhum dos handlers de follow-up usa updatedAt', () => {
    const handler1 = html.match(/copyFollowup1Btn\.addEventListener\('click', async \(\) => \{[\s\S]*?\}\);/)[0];
    const handler2 = html.match(/copyFollowup2Btn\.addEventListener\('click', async \(\) => \{[\s\S]*?\}\);/)[0];

    expect(handler1).not.toContain('updatedAt');
    expect(handler2).not.toContain('updatedAt');
  });
});

describe('rotas inexistentes', () => {
  test('404 com mensagem padrão', async () => {
    const res = await request(app).get('/api/nao-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Rota não encontrada');
  });
});