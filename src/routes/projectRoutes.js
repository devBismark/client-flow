const express = require('express');
const { scoreTier, getPricing } = require('../services/tierService');
const { requireAdminKey } = require('../middlewares/auth');
const { Project, STATUSES, TIERS } = require('../models/Project');
const { notifyNewBriefing } = require('../services/notificationService');

const router = express.Router();

// POST /api/projects — público (o cliente preenche o briefing)
router.post('/', async (req, res, next) => {
  try {
    const { clientName, clientContact, briefingAnswers, sobreNegocio, objetivoPagina, referencias } = req.body;

    const suggestedTier = scoreTier(briefingAnswers);

    const project = await Project.create({
      clientName,
      clientContact,
      briefingAnswers,
      sobreNegocio,
      objetivoPagina,
      referencias,
      suggestedTier,
    });

    res.status(201).json({ data: project });

    notifyNewBriefing(project, getPricing(suggestedTier));
  } catch (error) {
    next(error);
  }
});

// GET /api/projects — lista com paginação
router.get('/', requireAdminKey, async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const filter = req.query.status ? { status: req.query.status } : {};

    const [items, total] = await Promise.all([
      Project.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Project.countDocuments(filter),
    ]);

    res.json({ data: items, meta: { page, limit, total } });
  } catch (error) {
    next(error);
  }
});

// GET /api/projects/public/:token — proposta pública, sem autenticação
router.get('/public/:token', async (req, res, next) => {
  try {
    const project = await Project.findOne({ proposalToken: req.params.token });

    if (!project) {
      return res.status(404).json({ error: { message: 'Proposta não encontrada' } });
    }

    const tier = project.finalTier || project.suggestedTier;
    const pricing = getPricing(tier);

    res.json({
      data: {
        clientName: project.clientName,
        tierLabel: pricing.label,
        priceMin: pricing.min,
        priceMax: pricing.max,
        entrada: pricing.min / 2,
        prazo: project.prazoEstimado || pricing.prazo,
        revisoes: pricing.revisoes,
        inclui: pricing.inclui,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/projects/:id
router.get('/:id', requireAdminKey, async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: { message: 'Projeto não encontrado' } });
    }
    res.json({ data: project });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/projects/:id/status
router.patch('/:id/status', requireAdminKey, async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!STATUSES.includes(status)) {
      return res.status(400).json({
        error: { message: 'Status inválido', allowed: STATUSES },
      });
    }

    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { status },
      { returnDocument: 'after', runValidators: true }
    );

    if (!project) {
      return res.status(404).json({ error: { message: 'Projeto não encontrado' } });
    }

    res.json({ data: project });
  } catch (error) {
    next(error);
  }
});

// GET /api/projects/:id/proposal
router.get('/:id/proposal', requireAdminKey, async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: { message: 'Projeto não encontrado' } });
    }

    const tier = project.finalTier || project.suggestedTier;
    const pricing = getPricing(tier);

    res.json({
      data: {
        clientName: project.clientName,
        tier,
        tierLabel: pricing.label,
        priceRange: `${pricing.min}–${pricing.max}€`,
        entrada: `${pricing.min / 2}€`,
        status: project.status,
      },
    });
  } catch (error) {
    next(error);
  }
});
// PATCH /api/projects/:id — atualiza tier final e notas
router.patch('/:id', requireAdminKey, async (req, res, next) => {
  try {
    const { finalTier, notes } = req.body;
    const updates = {};

    if (finalTier !== undefined) {
      if (finalTier !== null && !TIERS.includes(finalTier)) {
        return res.status(400).json({
          error: { message: 'Tier inválido', allowed: TIERS },
        });
      }
      updates.finalTier = finalTier;
    }

    if (notes !== undefined) {
      updates.notes = notes;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: { message: 'Nada para atualizar' } });
    }

    const project = await Project.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: 'after',
      runValidators: true,
    });

    if (!project) {
      return res.status(404).json({ error: { message: 'Projeto não encontrado' } });
    }

    res.json({ data: project });
  } catch (error) {
    next(error);
  }
});
module.exports = router;