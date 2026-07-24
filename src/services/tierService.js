const WEIGHTS = {
  multiploServicos: 1,
  querAparecerGoogle: 1,
  temConcorrenteReferencia: 2,
  querInteracao: 2,
  materialDeSobra: 1,
};

const TIER_PRICING = {
  essencial: {
    label: 'Essencial',
    min: 150,
    max: 200,
    prazo: '3 a 5 dias úteis',
    revisoes: '1 ronda de revisões',
    inclui: [
      'Página única com estrutura simples',
      'Design adaptado a telemóvel',
      'Meta tags básicas para partilha',
      'Publicação e configuração do domínio',
    ],
  },
  profissional: {
    label: 'Profissional',
    min: 300,
    max: 400,
    prazo: '7 a 10 dias úteis',
    revisoes: '2 rondas de revisões',
    inclui: [
      'Estrutura completa — apresentação, serviços, galeria e contacto',
      'Texto adaptado para conversão',
      'Otimização para pesquisas locais no Google',
      'Tratamento e compressão das imagens',
      'Design adaptado a telemóvel',
      'Publicação e configuração do domínio',
    ],
  },
  premium: {
    label: 'Premium',
    min: 500,
    max: 700,
    prazo: '10 a 15 dias úteis',
    revisoes: '3 rondas de revisões',
    inclui: [
      'Tudo o que está no pacote Profissional',
      'Elementos interativos — animações, antes/depois, galeria dinâmica',
      'Direção de arte e curadoria das imagens',
      'Texto estratégico secção a secção',
      'SEO técnico completo com dados estruturados',
      'Otimização de desempenho',
    ],
  },
};

function calculateScore(answers = {}) {
  return Object.entries(WEIGHTS).reduce(
    (total, [key, weight]) => (answers[key] ? total + weight : total),
    0
  );
}

function scoreTier(answers = {}) {
  const score = calculateScore(answers);

  if (score >= 4) return 'premium';
  if (score >= 2) return 'profissional';
  return 'essencial';
}

function getPricing(tier) {
  return TIER_PRICING[tier] || null;
}

module.exports = { scoreTier, calculateScore, getPricing, TIER_PRICING };