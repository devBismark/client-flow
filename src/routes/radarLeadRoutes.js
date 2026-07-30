const express = require('express');
const { RadarLead, STATUSES, PRIORITIES } = require('../models/RadarLead');
const { RadarCampaign } = require('../models/RadarCampaign');
const { requireAdminKey } = require('../middlewares/auth');
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

async function loadCampaignOr404(req, res) {
  const campaign = await RadarCampaign.findById(req.params.campaignId);
  if (!campaign) {
    res.status(404).json({ error: { message: 'Campanha não encontrada' } });
    return null;
  }
  return campaign;
}

// POST /api/radar/campaigns/:campaignId/leads — admin, cria lead
router.post('/', requireAdminKey, async (req, res, next) => {
  try {
    const campaign = await loadCampaignOr404(req, res);
    if (!campaign) return;

    const {
      nomeEmpresa,
      nicho,
      cidade,
      pais,
      site,
      instagram,
      email,
      telefone,
      googleMapsUrl,
      observacoes,
    } = req.body;

    const lead = await RadarLead.create({
      campaign_id: campaign._id,
      nomeEmpresa,
      nicho,
      cidade,
      pais,
      site,
      instagram,
      email,
      telefone,
      googleMapsUrl,
      observacoes,
    });

    logAudit('radar_lead_created', {
      campaignId: String(campaign._id),
      leadId: String(lead._id),
      status: lead.status,
      prioridade: lead.prioridade,
      ip: maskIp(req.ip),
    });

    res.status(201).json({ data: lead });
  } catch (error) {
    next(error);
  }
});

// GET /api/radar/campaigns/:campaignId/leads — admin, lista paginada
router.get('/', requireAdminKey, async (req, res, next) => {
  try {
    const campaign = await loadCampaignOr404(req, res);
    if (!campaign) return;

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const filter = { campaign_id: campaign._id };

    if (req.query.status !== undefined) {
      if (!STATUSES.includes(req.query.status)) {
        return res.status(400).json({ error: { message: 'Status inválido', allowed: STATUSES } });
      }
      filter.status = req.query.status;
    }

    if (req.query.prioridade !== undefined) {
      if (!PRIORITIES.includes(req.query.prioridade)) {
        return res.status(400).json({ error: { message: 'Prioridade inválida', allowed: PRIORITIES } });
      }
      filter.prioridade = req.query.prioridade;
    }

    const [items, total] = await Promise.all([
      RadarLead.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      RadarLead.countDocuments(filter),
    ]);

    res.json({ data: items, meta: { page, limit, total } });
  } catch (error) {
    next(error);
  }
});

// GET /api/radar/campaigns/:campaignId/leads/:id — admin, detalhe
router.get('/:id', requireAdminKey, async (req, res, next) => {
  try {
    const campaign = await loadCampaignOr404(req, res);
    if (!campaign) return;

    const lead = await RadarLead.findOne({ _id: req.params.id, campaign_id: campaign._id });
    if (!lead) {
      return res.status(404).json({ error: { message: 'Lead não encontrado' } });
    }

    res.json({ data: lead });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/radar/campaigns/:campaignId/leads/:id — admin, atualiza dados/status/prioridade
router.patch('/:id', requireAdminKey, async (req, res, next) => {
  try {
    const campaign = await loadCampaignOr404(req, res);
    if (!campaign) return;

    const {
      nomeEmpresa,
      nicho,
      cidade,
      pais,
      site,
      instagram,
      email,
      telefone,
      googleMapsUrl,
      observacoes,
      status,
      prioridade,
    } = req.body;

    const updates = {};

    if (nomeEmpresa !== undefined) updates.nomeEmpresa = nomeEmpresa;
    if (nicho !== undefined) updates.nicho = nicho;
    if (cidade !== undefined) updates.cidade = cidade;
    if (pais !== undefined) updates.pais = pais;
    if (site !== undefined) updates.site = site;
    if (instagram !== undefined) updates.instagram = instagram;
    if (email !== undefined) updates.email = email;
    if (telefone !== undefined) updates.telefone = telefone;
    if (googleMapsUrl !== undefined) updates.googleMapsUrl = googleMapsUrl;
    if (observacoes !== undefined) updates.observacoes = observacoes;

    if (status !== undefined) {
      if (!STATUSES.includes(status)) {
        return res.status(400).json({ error: { message: 'Status inválido', allowed: STATUSES } });
      }
      updates.status = status;
    }

    if (prioridade !== undefined) {
      if (!PRIORITIES.includes(prioridade)) {
        return res.status(400).json({ error: { message: 'Prioridade inválida', allowed: PRIORITIES } });
      }
      updates.prioridade = prioridade;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: { message: 'Nada para atualizar' } });
    }

    const lead = await RadarLead.findOneAndUpdate(
      { _id: req.params.id, campaign_id: campaign._id },
      updates,
      { returnDocument: 'after', runValidators: true }
    );

    if (!lead) {
      return res.status(404).json({ error: { message: 'Lead não encontrado' } });
    }

    logAudit('radar_lead_updated', {
      campaignId: String(campaign._id),
      leadId: String(lead._id),
      fields: Object.keys(updates),
      ip: maskIp(req.ip),
    });

    res.json({ data: lead });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
