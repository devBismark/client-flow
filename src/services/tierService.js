const WEIGHTS = {
  multiploServicos: 1,
  querAparecerGoogle: 1,
  temConcorrenteReferencia: 2,
  querInteracao: 2,
  materialDeSobra: 1,
};

const TIER_PRICING = {
  essencial: { label: 'Essencial', min: 150, max: 200 },
  profissional: { label: 'Profissional', min: 300, max: 400 },
  premium: { label: 'Premium', min: 500, max: 700 },
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