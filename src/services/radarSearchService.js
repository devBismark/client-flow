const { buscarViaGooglePlaces } = require('./googlePlacesProvider');

const MAX_SUGGESTIONS = 5;

const PROVIDERS = { MOCK: 'mock', GOOGLE_PLACES: 'google_places' };

const SUFIXOS_FICTICIOS = ['Horizonte', 'Nova Esperança', 'Central', 'Bela Vista', 'Prime'];

function primeiraPalavra(texto) {
  const palavra = String(texto || '').trim().split(/\s+/)[0];
  return palavra || 'Negócio';
}

function slugify(texto) {
  return (
    String(texto || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 24) || 'negocio'
  );
}

function gerarNomeFicticio(nicho, indice) {
  const base = primeiraPalavra(nicho);
  const sufixo = SUFIXOS_FICTICIOS[indice % SUFIXOS_FICTICIOS.length];
  return `${base} ${sufixo}`;
}

// Gera sugestões de lead 100% locais, determinísticas e sem nenhuma chamada
// externa — provider mockado do Corte 13. Nomes são claramente fictícios
// (derivados do nicho + sufixo genérico); site/instagram usam um domínio
// placeholder ("exemplo.pt") que nunca resolve a um negócio real; email e
// telefone ficam vazios em vez de inventados, para nunca simular dado
// sensível real. Cada sugestão carrega metadados de origem (`fonte`, `query`)
// para o frontend/testes identificarem que veio do mock, não de integração real.
function buscarOportunidadesMock(campaign) {
  const nicho = (campaign && campaign.nicho ? campaign.nicho : '').trim();
  const cidade = (campaign && campaign.cidade ? campaign.cidade : '').trim();
  const produto = (campaign && campaign.produto ? campaign.produto : '').trim();

  const query = [nicho, cidade].filter(Boolean).join(' em ') || 'oportunidades locais';

  const sugestoes = [];

  for (let indice = 0; indice < MAX_SUGGESTIONS; indice += 1) {
    const nomeEmpresa = gerarNomeFicticio(nicho, indice);
    const slug = slugify(`${nomeEmpresa}-${indice}`);

    sugestoes.push({
      nomeEmpresa,
      nicho,
      cidade,
      pais: '',
      site: `https://${slug}.exemplo.pt`,
      instagram: `@${slug}`,
      email: '',
      telefone: '',
      googleMapsUrl: '',
      observacoes: produto
        ? `Sugestão mockada gerada localmente — possível interesse em ${produto}. Sem integração externa.`
        : 'Sugestão mockada gerada localmente, sem integração externa.',
      fonte: 'mock',
      query,
    });
  }

  return sugestoes;
}

// Provider switch: `mock` é sempre o default absoluto. O provider real só
// roda se `RADAR_SEARCH_PROVIDER=google_places` **e** `GOOGLE_PLACES_API_KEY`
// existirem juntos — nenhuma das duas condições sozinha liga o Google. Se o
// provider real falhar (chave ausente, erro de rede, erro HTTP), o erro sobe
// para quem chamou — nunca cai de volta para o mock em silêncio, para nunca
// misturar dado real com fictício sem o operador perceber.
function providerConfigurado() {
  return process.env.RADAR_SEARCH_PROVIDER === PROVIDERS.GOOGLE_PLACES
    ? PROVIDERS.GOOGLE_PLACES
    : PROVIDERS.MOCK;
}

async function buscarOportunidades(campaign) {
  const provider = providerConfigurado();

  if (provider === PROVIDERS.GOOGLE_PLACES) {
    const sugestoes = await buscarViaGooglePlaces(campaign, {
      apiKey: process.env.GOOGLE_PLACES_API_KEY,
    });
    return { sugestoes, provider: PROVIDERS.GOOGLE_PLACES };
  }

  return { sugestoes: buscarOportunidadesMock(campaign), provider: PROVIDERS.MOCK };
}

module.exports = { buscarOportunidadesMock, buscarOportunidades, MAX_SUGGESTIONS, PROVIDERS };
