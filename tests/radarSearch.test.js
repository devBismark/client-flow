process.env.ADMIN_KEY = 'test-key';

require('./setup');

const request = require('supertest');
const app = require('../app');
const { buscarOportunidadesMock, buscarOportunidades, MAX_SUGGESTIONS } = require('../src/services/radarSearchService');

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

async function criarLead(campaignId, overrides = {}) {
  const res = await request(app)
    .post(`/api/radar/campaigns/${campaignId}/leads`)
    .set(AUTH)
    .send({ nomeEmpresa: 'Clínica Teste', ...overrides });
  return res.body.data;
}

describe('POST /api/radar/campaigns/:campaignId/search', () => {
  test('401 sem admin key', async () => {
    const campanha = await criarCampanha();
    const res = await request(app).post(`/api/radar/campaigns/${campanha._id}/search`);
    expect(res.status).toBe(401);
  });

  test('404 quando campanha não existe', async () => {
    const res = await request(app)
      .post(`/api/radar/campaigns/${ID_INEXISTENTE}/search`)
      .set(AUTH);
    expect(res.status).toBe(404);
  });

  test('400 quando campaignId é malformado', async () => {
    const res = await request(app)
      .post('/api/radar/campaigns/id-invalido/search')
      .set(AUTH);
    expect(res.status).toBe(400);
  });

  test('retorna sugestões mockadas com metadados de origem', async () => {
    const campanha = await criarCampanha();

    const res = await request(app)
      .post(`/api/radar/campaigns/${campanha._id}/search`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.sugestoes)).toBe(true);
    expect(res.body.data.sugestoes.length).toBeGreaterThan(0);

    const primeira = res.body.data.sugestoes[0];
    expect(primeira.fonte).toBe('mock');
    expect(typeof primeira.query).toBe('string');
    expect(primeira.nomeEmpresa).toBeTruthy();
    expect(primeira).toHaveProperty('duplicado');
  });

  test('respeita o limite máximo de sugestões', async () => {
    const campanha = await criarCampanha();

    const res = await request(app)
      .post(`/api/radar/campaigns/${campanha._id}/search`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.sugestoes.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
    expect(res.body.data.sugestoes.length).toBe(MAX_SUGGESTIONS);
  });

  test('não persiste nenhum lead ao buscar', async () => {
    const campanha = await criarCampanha();

    await request(app)
      .post(`/api/radar/campaigns/${campanha._id}/search`)
      .set(AUTH);

    const lista = await request(app)
      .get(`/api/radar/campaigns/${campanha._id}/leads`)
      .set(AUTH);

    expect(lista.body.meta.total).toBe(0);
  });

  test('marca sugestão como duplicada quando já existe lead com o mesmo nomeEmpresa+cidade na campanha', async () => {
    const campanha = await criarCampanha();

    // Gera as sugestões mockadas de antemão (função pura, determinística) para
    // saber exatamente qual nome/cidade a primeira sugestão terá, e cria um
    // lead real na campanha com esses mesmos dados antes de buscar.
    const sugestoesEsperadas = buscarOportunidadesMock(campanha);
    const primeiraEsperada = sugestoesEsperadas[0];

    await criarLead(campanha._id, {
      nomeEmpresa: primeiraEsperada.nomeEmpresa,
      cidade: primeiraEsperada.cidade,
    });

    const res = await request(app)
      .post(`/api/radar/campaigns/${campanha._id}/search`)
      .set(AUTH);

    expect(res.status).toBe(200);
    const primeira = res.body.data.sugestoes[0];
    expect(primeira.nomeEmpresa).toBe(primeiraEsperada.nomeEmpresa);
    expect(primeira.duplicado).toBe(true);
  });

  test('não marca como duplicada uma sugestão sem correspondência na campanha', async () => {
    const campanha = await criarCampanha();
    await criarLead(campanha._id, { nomeEmpresa: 'Negócio Completamente Diferente', cidade: 'Cidade Que Não Existe' });

    const res = await request(app)
      .post(`/api/radar/campaigns/${campanha._id}/search`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.sugestoes.every((s) => s.duplicado === false)).toBe(true);
  });

  test('duplicata sinalizada não bloqueia a busca nem impede salvar via POST de lead existente', async () => {
    const campanha = await criarCampanha();
    const sugestoesEsperadas = buscarOportunidadesMock(campanha);
    const primeiraEsperada = sugestoesEsperadas[0];

    await criarLead(campanha._id, {
      nomeEmpresa: primeiraEsperada.nomeEmpresa,
      cidade: primeiraEsperada.cidade,
    });

    const busca = await request(app)
      .post(`/api/radar/campaigns/${campanha._id}/search`)
      .set(AUTH);
    expect(busca.status).toBe(200);
    expect(busca.body.data.sugestoes[0].duplicado).toBe(true);

    // "Salvar" uma sugestão duplicada continua sendo permitido pelo endpoint
    // de criação de lead já existente — a busca só sinaliza, nunca bloqueia.
    const salvar = await request(app)
      .post(`/api/radar/campaigns/${campanha._id}/leads`)
      .set(AUTH)
      .send({
        nomeEmpresa: primeiraEsperada.nomeEmpresa,
        cidade: primeiraEsperada.cidade,
      });
    expect(salvar.status).toBe(201);
  });

  test('isolamento: sugestões de uma campanha não são marcadas como duplicadas por leads de outra campanha', async () => {
    const campanhaA = await criarCampanha({ produto: 'Produto A' });
    const campanhaB = await criarCampanha({ produto: 'Produto B' });

    const sugestoesA = buscarOportunidadesMock(campanhaA);
    await criarLead(campanhaB._id, {
      nomeEmpresa: sugestoesA[0].nomeEmpresa,
      cidade: sugestoesA[0].cidade,
    });

    const res = await request(app)
      .post(`/api/radar/campaigns/${campanhaA._id}/search`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.sugestoes[0].duplicado).toBe(false);
  });

  describe('com RADAR_SEARCH_PROVIDER=google_places (fetch sempre mockado, nunca rede real)', () => {
    const envOriginal = {
      RADAR_SEARCH_PROVIDER: process.env.RADAR_SEARCH_PROVIDER,
      GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,
    };
    const fetchOriginal = global.fetch;

    afterEach(() => {
      if (envOriginal.RADAR_SEARCH_PROVIDER === undefined) delete process.env.RADAR_SEARCH_PROVIDER;
      else process.env.RADAR_SEARCH_PROVIDER = envOriginal.RADAR_SEARCH_PROVIDER;

      if (envOriginal.GOOGLE_PLACES_API_KEY === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
      else process.env.GOOGLE_PLACES_API_KEY = envOriginal.GOOGLE_PLACES_API_KEY;

      global.fetch = fetchOriginal;
      jest.restoreAllMocks();
    });

    test('retorna sugestões com fonte "google_places" e não persiste nenhum lead', async () => {
      process.env.RADAR_SEARCH_PROVIDER = 'google_places';
      process.env.GOOGLE_PLACES_API_KEY = 'chave-teste-rota';
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          places: [{ id: 'p1', displayName: { text: 'Negócio Google Rota' } }],
        }),
      });

      const campanha = await criarCampanha();

      const res = await request(app)
        .post(`/api/radar/campaigns/${campanha._id}/search`)
        .set(AUTH);

      expect(res.status).toBe(200);
      expect(res.body.data.provider).toBe('google_places');
      expect(res.body.data.sugestoes[0].fonte).toBe('google_places');
      expect(res.body.data.sugestoes[0].nomeEmpresa).toBe('Negócio Google Rota');

      const lista = await request(app)
        .get(`/api/radar/campaigns/${campanha._id}/leads`)
        .set(AUTH);
      expect(lista.body.meta.total).toBe(0);
    });

    test('erro do provider real (chave ausente) retorna erro claro na rota, sem persistir nada', async () => {
      process.env.RADAR_SEARCH_PROVIDER = 'google_places';
      delete process.env.GOOGLE_PLACES_API_KEY;
      global.fetch = jest.fn();

      const campanha = await criarCampanha();

      const res = await request(app)
        .post(`/api/radar/campaigns/${campanha._id}/search`)
        .set(AUTH);

      expect(res.status).toBe(500);
      expect(res.body.error.message).toMatch(/GOOGLE_PLACES_API_KEY/);
      expect(global.fetch).not.toHaveBeenCalled();

      const lista = await request(app)
        .get(`/api/radar/campaigns/${campanha._id}/leads`)
        .set(AUTH);
      expect(lista.body.meta.total).toBe(0);
    });

    test('erro HTTP do Google retorna 502 claro na rota, sem persistir nada', async () => {
      process.env.RADAR_SEARCH_PROVIDER = 'google_places';
      process.env.GOOGLE_PLACES_API_KEY = 'chave-teste-rota';
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'quota exceeded' } }),
      });

      const campanha = await criarCampanha();

      const res = await request(app)
        .post(`/api/radar/campaigns/${campanha._id}/search`)
        .set(AUTH);

      expect(res.status).toBe(502);
      expect(res.body.error.message).not.toMatch(/quota exceeded/);

      const lista = await request(app)
        .get(`/api/radar/campaigns/${campanha._id}/leads`)
        .set(AUTH);
      expect(lista.body.meta.total).toBe(0);
    });

    test('nenhum log (sucesso ou erro) contém a chave configurada', async () => {
      process.env.RADAR_SEARCH_PROVIDER = 'google_places';
      process.env.GOOGLE_PLACES_API_KEY = 'chave-super-secreta-999';
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ places: [{ id: 'p1', displayName: { text: 'Negócio X' } }] }),
      });

      const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const campanha = await criarCampanha();
      await request(app).post(`/api/radar/campaigns/${campanha._id}/search`).set(AUTH);

      const todasAsChamadas = [...infoSpy.mock.calls, ...errorSpy.mock.calls]
        .map((args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
        .join('\n');

      expect(todasAsChamadas).not.toContain('chave-super-secreta-999');
    });
  });
});

describe('radarSearchService.buscarOportunidades() — provider switch', () => {
  const envOriginal = {
    RADAR_SEARCH_PROVIDER: process.env.RADAR_SEARCH_PROVIDER,
    GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,
  };
  const fetchOriginal = global.fetch;

  afterEach(() => {
    if (envOriginal.RADAR_SEARCH_PROVIDER === undefined) delete process.env.RADAR_SEARCH_PROVIDER;
    else process.env.RADAR_SEARCH_PROVIDER = envOriginal.RADAR_SEARCH_PROVIDER;

    if (envOriginal.GOOGLE_PLACES_API_KEY === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = envOriginal.GOOGLE_PLACES_API_KEY;

    global.fetch = fetchOriginal;
  });

  test('usa mock por default quando RADAR_SEARCH_PROVIDER não está definido', async () => {
    delete process.env.RADAR_SEARCH_PROVIDER;
    delete process.env.GOOGLE_PLACES_API_KEY;

    const resultado = await buscarOportunidades({ nicho: 'X', cidade: 'Y', produto: 'Z' });
    expect(resultado.provider).toBe('mock');
    expect(resultado.sugestoes[0].fonte).toBe('mock');
  });

  test('usa mock mesmo com GOOGLE_PLACES_API_KEY configurada, se RADAR_SEARCH_PROVIDER não for "google_places"', async () => {
    delete process.env.RADAR_SEARCH_PROVIDER;
    process.env.GOOGLE_PLACES_API_KEY = 'chave-teste';
    global.fetch = jest.fn();

    const resultado = await buscarOportunidades({ nicho: 'X', cidade: 'Y' });
    expect(resultado.provider).toBe('mock');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('usa google_places quando RADAR_SEARCH_PROVIDER=google_places e a chave existe', async () => {
    process.env.RADAR_SEARCH_PROVIDER = 'google_places';
    process.env.GOOGLE_PLACES_API_KEY = 'chave-teste';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ places: [{ id: 'p1', displayName: { text: 'Negócio Google' } }] }),
    });

    const resultado = await buscarOportunidades({ nicho: 'X', cidade: 'Y' });

    expect(resultado.provider).toBe('google_places');
    expect(resultado.sugestoes[0].fonte).toBe('google_places');
    expect(resultado.sugestoes[0].nomeEmpresa).toBe('Negócio Google');
  });

  test('não cai para mock em silêncio quando RADAR_SEARCH_PROVIDER=google_places mas falta a chave — lança erro claro', async () => {
    process.env.RADAR_SEARCH_PROVIDER = 'google_places';
    delete process.env.GOOGLE_PLACES_API_KEY;
    global.fetch = jest.fn();

    await expect(buscarOportunidades({ nicho: 'X', cidade: 'Y' })).rejects.toMatchObject({ status: 500 });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('buscarOportunidadesMock() — função pura do serviço', () => {
  test('nunca retorna mais que MAX_SUGGESTIONS sugestões', () => {
    const campanha = { produto: 'X', nicho: 'Y', cidade: 'Z' };
    const sugestoes = buscarOportunidadesMock(campanha);
    expect(sugestoes.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
  });

  test('usa nicho/cidade/produto da campanha, nunca inventa dado sensível (email/telefone vazios)', () => {
    const campanha = { produto: 'Landing page', nicho: 'Clínicas odontológicas', cidade: 'Lisboa' };
    const sugestoes = buscarOportunidadesMock(campanha);

    sugestoes.forEach((s) => {
      expect(s.cidade).toBe('Lisboa');
      expect(s.nicho).toBe('Clínicas odontológicas');
      expect(s.email).toBe('');
      expect(s.telefone).toBe('');
      expect(s.fonte).toBe('mock');
      expect(s.query).toContain('Clínicas odontológicas');
    });
  });

  test('é determinística — a mesma campanha sempre produz a mesma lista', () => {
    const campanha = { produto: 'X', nicho: 'Y', cidade: 'Z' };
    expect(buscarOportunidadesMock(campanha)).toEqual(buscarOportunidadesMock(campanha));
  });
});
