const express = require('express');
const { RadarCampaign, STATUSES } = require('../models/RadarCampaign');
const { requireAdminKey } = require('../middlewares/auth');
const router = express.Router();

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

// POST /api/radar/campaigns — admin, cria campanha
router.post('/', requireAdminKey, async (req, res, next) => {
  try {
    const { produto, nicho, cidade, objetivo, descricao } = req.body;

    const campaign = await RadarCampaign.create({
      produto,
      nicho,
      cidade,
      objetivo,
      descricao,
    });

    logAudit('radar_campaign_created', {
      campaignId: String(campaign._id),
      status: campaign.status,
      ip: maskIp(req.ip),
    });

    res.status(201).json({ data: campaign });
  } catch (error) {
    next(error);
  }
});

// GET /api/radar/campaigns — admin, lista paginada
router.get('/', requireAdminKey, async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const filter = {};
    if (req.query.status !== undefined) {
      if (!STATUSES.includes(req.query.status)) {
        return res.status(400).json({ error: { message: 'Status inválido', allowed: STATUSES } });
      }
      filter.status = req.query.status;
    }

    const [items, total] = await Promise.all([
      RadarCampaign.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      RadarCampaign.countDocuments(filter),
    ]);

    res.json({ data: items, meta: { page, limit, total } });
  } catch (error) {
    next(error);
  }
});

// GET /api/radar/campaigns/:id — admin, detalhe
router.get('/:id', requireAdminKey, async (req, res, next) => {
  try {
    const campaign = await RadarCampaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: { message: 'Campanha não encontrada' } });
    }
    res.json({ data: campaign });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/radar/campaigns/:id — admin, atualiza dados/status
router.patch('/:id', requireAdminKey, async (req, res, next) => {
  try {
    const { produto, nicho, cidade, objetivo, descricao, status } = req.body;
    const updates = {};

    if (produto !== undefined) updates.produto = produto;
    if (nicho !== undefined) updates.nicho = nicho;
    if (cidade !== undefined) updates.cidade = cidade;
    if (objetivo !== undefined) updates.objetivo = objetivo;
    if (descricao !== undefined) updates.descricao = descricao;

    if (status !== undefined) {
      if (!STATUSES.includes(status)) {
        return res.status(400).json({
          error: { message: 'Status inválido', allowed: STATUSES },
        });
      }
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: { message: 'Nada para atualizar' } });
    }

    const campaign = await RadarCampaign.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: 'after',
      runValidators: true,
    });

    if (!campaign) {
      return res.status(404).json({ error: { message: 'Campanha não encontrada' } });
    }

    logAudit('radar_campaign_updated', {
      campaignId: String(campaign._id),
      fields: Object.keys(updates),
      ip: maskIp(req.ip),
    });

    res.json({ data: campaign });
  } catch (error) {
    next(error);
  }
});

router.maskIp = maskIp;

module.exports = router;
