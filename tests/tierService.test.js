const { scoreTier, calculateScore, getPricing } = require('../src/services/tierService');

describe('calculateScore', () => {
  test('retorna 0 quando nenhuma resposta é positiva', () => {
    expect(calculateScore({})).toBe(0);
  });

  test('soma os pesos corretamente', () => {
    expect(calculateScore({ querInteracao: true, multiploServicos: true })).toBe(3);
  });

  test('ignora chaves desconhecidas', () => {
    expect(calculateScore({ chaveInvalida: true })).toBe(0);
  });

  test('retorna 7 com todas as respostas positivas', () => {
    expect(
      calculateScore({
        multiploServicos: true,
        querAparecerGoogle: true,
        temConcorrenteReferencia: true,
        querInteracao: true,
        materialDeSobra: true,
      })
    ).toBe(7);
  });
});

describe('scoreTier', () => {
  test('essencial quando score < 2', () => {
    expect(scoreTier({ multiploServicos: true })).toBe('essencial');
  });

  test('profissional quando score entre 2 e 3', () => {
    expect(scoreTier({ multiploServicos: true, querAparecerGoogle: true })).toBe('profissional');
  });

  test('premium quando score >= 4', () => {
    expect(scoreTier({ querInteracao: true, temConcorrenteReferencia: true })).toBe('premium');
  });

  test('essencial para objeto vazio', () => {
    expect(scoreTier({})).toBe('essencial');
  });

  test('não quebra sem argumento', () => {
    expect(scoreTier()).toBe('essencial');
  });
});

describe('getPricing', () => {
  test('retorna dados do premium', () => {
    const pricing = getPricing('premium');
    expect(pricing.label).toBe('Premium');
    expect(pricing.min).toBe(500);
    expect(pricing.max).toBe(700);
    expect(pricing.inclui.length).toBeGreaterThan(0);
  });

  test('retorna null para tier inexistente', () => {
    expect(getPricing('inexistente')).toBeNull();
  });
});