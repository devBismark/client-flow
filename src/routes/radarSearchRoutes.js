const express = require('express');
const { RadarCampaign } = require('../models/RadarCampaign');
const { RadarLead } = require('../models/RadarLead');
const { requireAdminKey } = require('../middlewares/auth');
const { buscarOportunidades } = require('../services/radarSearchService');
const router = express.Router({ mergeParams: true });

function maskIp(ip) {
  if (!ip) return null;

  const ipv4Mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+)\.\d+$/i);
  if (ipv4Mapped) {
    return `::ffff:${ipv4Mapped[1]}.xxx`;
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    return ip.replace(/\.\d+$/, '.xxx');
  }

  if (ip.includes(':')) {
    return '[ipv6-masked]';
  }

  return '[ip-masked]';
}

function logAudit(event, data) {
  console.info(`[audit] ${JSON.stringify({ event, ...data, at: new Date().toISOString() })}`);
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

// POST /api/radar/campaigns/:campaignId/search — admin, gera sugestões de lead.
// Provider mockado por padrão (Corte 13); Google Places real só se
// RADAR_SEARCH_PROVIDER=google_places e GOOGLE_PLACES_API_KEY existirem
// (Corte 14) — nunca persiste nada em nenhum dos dois casos. Sugestões
// duplicadas contra leads já existentes na campanha só são sinalizadas
// (`duplicado: true`), nunca bloqueadas — a decisão de salvar ou não continua
// sendo do operador via POST /leads já existente.
router.post('/', requireAdminKey, async (req, res, next) => {
  try {
    const campaign = await RadarCampaign.findById(req.params.campaignId);
    if (!campaign) {
      return res.status(404).json({ error: { message: 'Campanha não encontrada' } });
    }

    let resultadoBusca;
    try {
      resultadoBusca = await buscarOportunidades(campaign);
    } catch (erroBusca) {
      // Erro do provider (chave ausente, rede fora, erro HTTP do Google) —
      // nunca cai para o mock em silêncio; retorna erro claro e seguro
      // (mensagem já vem sem chave/resposta bruta desde o provider).
      logAudit('radar_search_failed', {
        campaignId: String(campaign._id),
        provider: erroBusca.provider || 'desconhecido',
        ip: maskIp(req.ip),
      });
      return res.status(erroBusca.status || 502).json({
        error: { message: erroBusca.message || 'Não foi possível buscar oportunidades.' },
      });
    }

    const { sugestoes: sugestoesBrutas, provider } = resultadoBusca;

    const existentes = await RadarLead.find({ campaign_id: campaign._id })
      .select('nomeEmpresa cidade email telefone')
      .lean();

    const assinaturas = {
      email: new Set(existentes.filter((l) => l.email).map((l) => normalize(l.email))),
      telefone: new Set(existentes.filter((l) => l.telefone).map((l) => normalize(l.telefone))),
      nomeCidade: new Set(existentes.map((l) => `${normalize(l.nomeEmpresa)}|${normalize(l.cidade)}`)),
    };

    const sugestoes = sugestoesBrutas.map((sugestao) => {
      const emailNorm = normalize(sugestao.email);
      const telefoneNorm = normalize(sugestao.telefone);
      const nomeCidadeNorm = `${normalize(sugestao.nomeEmpresa)}|${normalize(sugestao.cidade)}`;

      const duplicado =
        (emailNorm && assinaturas.email.has(emailNorm)) ||
        (telefoneNorm && assinaturas.telefone.has(telefoneNorm)) ||
        assinaturas.nomeCidade.has(nomeCidadeNorm);

      return { ...sugestao, duplicado };
    });

    logAudit('radar_search_performed', {
      campaignId: String(campaign._id),
      provider,
      total: sugestoes.length,
      duplicados: sugestoes.filter((s) => s.duplicado).length,
      ip: maskIp(req.ip),
    });

    res.json({ data: { sugestoes, provider } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
