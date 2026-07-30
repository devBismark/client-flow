const PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.businessStatus',
].join(',');

const MAX_SUGGESTIONS = 5;

function criarErro(message, status) {
  const erro = new Error(message);
  erro.status = status;
  erro.provider = 'google_places';
  return erro;
}

function montarQuery(campaign) {
  const nicho = (campaign && campaign.nicho ? campaign.nicho : '').trim();
  const cidade = (campaign && campaign.cidade ? campaign.cidade : '').trim();
  return [nicho, cidade].filter(Boolean).join(' em ') || 'oportunidades locais';
}

// Mapeia um "Place" da resposta do Google para o formato de sugestão do Radar.
// `cidade` vem sempre da campanha (nunca de parsing de `formattedAddress`,
// decisão fechada para evitar heurística frágil de endereço internacional);
// `formattedAddress`/`businessStatus` viram texto em `observacoes`, nunca um
// campo à parte — nenhum dado de terceiro (reviews/rating/fotos) é lido ou
// repassado, porque nunca foi pedido via FIELD_MASK. `placeId` só existe na
// sugestão em memória — nunca é persistido como campo de `RadarLead`.
function mapearSugestao(place, campaign, query) {
  const cidade = (campaign && campaign.cidade ? campaign.cidade : '').trim();
  const nicho = (campaign && campaign.nicho ? campaign.nicho : '').trim();

  const detalhes = [];
  if (place.formattedAddress) detalhes.push(place.formattedAddress);
  if (place.businessStatus) detalhes.push(`Status: ${place.businessStatus}`);
  detalhes.push('Sugestão via Google Places — dado de terceiro, revise antes de salvar.');

  return {
    nomeEmpresa: (place.displayName && place.displayName.text) || '',
    nicho,
    cidade,
    pais: '',
    site: place.websiteUri || '',
    instagram: '',
    email: '',
    telefone: place.internationalPhoneNumber || '',
    googleMapsUrl: place.googleMapsUri || '',
    observacoes: detalhes.join(' — '),
    fonte: 'google_places',
    query,
    placeId: place.id || '',
  };
}

// Chama a Places API (New) — Text Search. Nunca loga a chave nem a resposta
// bruta; erros são sempre mensagens genéricas e seguras, nunca incluem
// cabeçalhos, corpo da requisição/resposta ou a chave em si.
async function buscarViaGooglePlaces(campaign, { apiKey } = {}) {
  if (!apiKey) {
    throw criarErro('GOOGLE_PLACES_API_KEY não configurada.', 500);
  }

  const query = montarQuery(campaign);

  let resposta;
  try {
    resposta = await fetch(PLACES_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: MAX_SUGGESTIONS,
      }),
    });
  } catch (erroRede) {
    throw criarErro('Não foi possível contatar o Google Places (erro de rede).', 502);
  }

  if (!resposta.ok) {
    throw criarErro(`Google Places retornou um erro (status ${resposta.status}).`, 502);
  }

  let corpo;
  try {
    corpo = await resposta.json();
  } catch (erroParse) {
    throw criarErro('Resposta inesperada do Google Places.', 502);
  }

  const places = Array.isArray(corpo.places) ? corpo.places : [];

  return places.slice(0, MAX_SUGGESTIONS).map((place) => mapearSugestao(place, campaign, query));
}

module.exports = { buscarViaGooglePlaces, MAX_SUGGESTIONS };
