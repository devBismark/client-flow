const { buscarViaGooglePlaces, MAX_SUGGESTIONS } = require('../src/services/googlePlacesProvider');

describe('googlePlacesProvider.buscarViaGooglePlaces() — sempre com fetch mockado, nunca rede real', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('lança erro claro quando a chave está ausente, sem chamar fetch', async () => {
    global.fetch = jest.fn();

    await expect(buscarViaGooglePlaces({ nicho: 'X', cidade: 'Y' }, {})).rejects.toMatchObject({
      status: 500,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('mensagem de erro por chave ausente não expõe nenhum valor de chave', async () => {
    global.fetch = jest.fn();

    let erroCapturado;
    try {
      await buscarViaGooglePlaces({ nicho: 'X', cidade: 'Y' }, { apiKey: '' });
    } catch (erro) {
      erroCapturado = erro;
    }

    expect(erroCapturado).toBeDefined();
    expect(erroCapturado.message).toMatch(/GOOGLE_PLACES_API_KEY/);
  });

  test('mapeia resposta fake corretamente — cidade vem da campanha, nunca de formattedAddress', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        places: [
          {
            id: 'place123',
            displayName: { text: 'Clínica Google Teste' },
            formattedAddress: 'Rua Exemplo, 123, Lisboa, Portugal',
            internationalPhoneNumber: '+351 900 000 000',
            websiteUri: 'https://clinicagoogle.pt',
            googleMapsUri: 'https://maps.google.com/?cid=123',
            businessStatus: 'OPERATIONAL',
            rating: 4.5,
            userRatingCount: 200,
            reviews: [{ text: 'ótimo lugar, recomendo muito' }],
            photos: [{ name: 'foto-1' }],
          },
        ],
      }),
    });

    const campanha = { nicho: 'Clínicas odontológicas', cidade: 'Lisboa', produto: 'Landing page' };
    const sugestoes = await buscarViaGooglePlaces(campanha, { apiKey: 'chave-teste' });

    expect(sugestoes).toHaveLength(1);
    const s = sugestoes[0];

    expect(s.nomeEmpresa).toBe('Clínica Google Teste');
    expect(s.nicho).toBe('Clínicas odontológicas');
    expect(s.cidade).toBe('Lisboa');
    expect(s.pais).toBe('');
    expect(s.site).toBe('https://clinicagoogle.pt');
    expect(s.telefone).toBe('+351 900 000 000');
    expect(s.googleMapsUrl).toBe('https://maps.google.com/?cid=123');
    expect(s.instagram).toBe('');
    expect(s.email).toBe('');
    expect(s.fonte).toBe('google_places');
    expect(s.placeId).toBe('place123');
    expect(typeof s.query).toBe('string');

    // formattedAddress/businessStatus viram observações — nunca campos à parte.
    expect(s.observacoes).toContain('Rua Exemplo, 123, Lisboa, Portugal');
    expect(s.observacoes).toContain('OPERATIONAL');

    // Nenhum dado de terceiro (reviews/rating/photos) nunca pedido via FieldMask
    // deve vazar para a sugestão mapeada, em nenhum campo.
    const sugestaoSerializada = JSON.stringify(s);
    expect(sugestaoSerializada).not.toMatch(/rating|userRatingCount|reviews|ótimo lugar|photos|foto-1/i);
  });

  test('respeita o limite máximo de sugestões mesmo se a API devolver mais resultados', async () => {
    const muitosPlaces = Array.from({ length: 20 }, (_, i) => ({
      id: `place-${i}`,
      displayName: { text: `Negócio ${i}` },
    }));
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ places: muitosPlaces }),
    });

    const sugestoes = await buscarViaGooglePlaces({ nicho: 'X', cidade: 'Y' }, { apiKey: 'chave-teste' });
    expect(sugestoes.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
    expect(sugestoes.length).toBe(MAX_SUGGESTIONS);
  });

  test('envia a chave só via header X-Goog-Api-Key (nunca na URL) e um FieldMask restrito', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ places: [] }),
    });

    await buscarViaGooglePlaces({ nicho: 'Clínicas', cidade: 'Lisboa' }, { apiKey: 'chave-secreta-123' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];

    expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(url).not.toContain('chave-secreta-123');
    expect(options.headers['X-Goog-Api-Key']).toBe('chave-secreta-123');

    const fieldMask = options.headers['X-Goog-FieldMask'];
    expect(fieldMask).toBe(
      'places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.businessStatus'
    );
    expect(fieldMask).not.toMatch(/reviews|rating|photos|priceLevel|editorialSummary/);

    const corpo = JSON.parse(options.body);
    expect(corpo.textQuery).toContain('Clínicas');
    expect(corpo.textQuery).toContain('Lisboa');
    expect(corpo.maxResultCount).toBe(MAX_SUGGESTIONS);
  });

  test('trata erro de rede sem vazar detalhes, com status seguro (502)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      buscarViaGooglePlaces({ nicho: 'X', cidade: 'Y' }, { apiKey: 'chave-teste' })
    ).rejects.toMatchObject({ status: 502 });
  });

  test('trata erro HTTP (não-ok) sem vazar o corpo da resposta na mensagem', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'quota exceeded', details: 'segredo-interno-do-google' } }),
    });

    let erroCapturado;
    try {
      await buscarViaGooglePlaces({ nicho: 'X', cidade: 'Y' }, { apiKey: 'chave-teste' });
    } catch (erro) {
      erroCapturado = erro;
    }

    expect(erroCapturado).toBeDefined();
    expect(erroCapturado.status).toBe(502);
    expect(erroCapturado.message).not.toContain('segredo-interno-do-google');
    expect(erroCapturado.message).not.toContain('quota exceeded');
  });

  test('trata resposta com JSON inválido sem quebrar, com status seguro', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('invalid json');
      },
    });

    await expect(
      buscarViaGooglePlaces({ nicho: 'X', cidade: 'Y' }, { apiKey: 'chave-teste' })
    ).rejects.toMatchObject({ status: 502 });
  });

  test('resposta sem "places" (ou vazia) retorna lista vazia, sem erro', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const sugestoes = await buscarViaGooglePlaces({ nicho: 'X', cidade: 'Y' }, { apiKey: 'chave-teste' });
    expect(sugestoes).toEqual([]);
  });
});
