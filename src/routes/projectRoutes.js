const express = require('express');
const multer = require('multer');
const { scoreTier, getPricing } = require('../services/tierService');
const { requireAdminKey } = require('../middlewares/auth');
const { Project, STATUSES, TIERS } = require('../models/Project');
const { notifyNewBriefing } = require('../services/notificationService');
const { saveClientPhotos } = require('../services/assetStorage');
const { createRateLimiter } = require('../middlewares/rateLimiter');
const router = express.Router();
const { ZipArchive } = require('archiver');

const projectsAdminLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 60,
  methods: ['GET', 'PATCH', 'DELETE'],
});

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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
});

// POST /api/projects — público (o cliente preenche o briefing + até 10 fotos)
router.post('/', upload.array('photos', 10), async (req, res, next) => {
  try {
   const { clientName, clientContact, sobreNegocio, objetivoPagina, referencias } = req.body;
const briefingAnswers = typeof req.body.briefingAnswers === 'string'
  ? JSON.parse(req.body.briefingAnswers)
  : req.body.briefingAnswers;

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

  (async () => {
  try {
    console.log('DEBUG req.files.length:', req.files ? req.files.length : 'undefined');
    const { urls: photoUrls } = await saveClientPhotos(project, req.files);
    console.log('DEBUG photoUrls:', photoUrls);
    const result = await notifyNewBriefing(project, getPricing(suggestedTier), req.files, photoUrls);
    console.log('DEBUG notifyNewBriefing result:', result);
  } catch (err) {
    console.error('Falha ao processar fotos/notificação:', err.message);
  }
})();
  } catch (error) {
    next(error);
  }
});

// GET /api/projects — lista com paginação
router.get('/', projectsAdminLimiter, requireAdminKey, async (req, res, next) => {
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
router.get('/:id', projectsAdminLimiter, requireAdminKey, async (req, res, next) => {
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
router.patch('/:id/status', projectsAdminLimiter, requireAdminKey, async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!STATUSES.includes(status)) {
      return res.status(400).json({
        error: { message: 'Status inválido', allowed: STATUSES },
      });
    }

    const existing = await Project.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: { message: 'Projeto não encontrado' } });
    }

    const updates = { status };
    if (existing.status !== status) {
      updates.statusChangedAt = new Date();
    }

    const project = await Project.findByIdAndUpdate(
      req.params.id,
      updates,
      { returnDocument: 'after', runValidators: true }
    );

    res.json({ data: project });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/projects/:id/follow-up — marcação manual de follow-up enviado (nunca automática)
router.patch('/:id/follow-up', projectsAdminLimiter, requireAdminKey, async (req, res, next) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { $inc: { followUpCount: 1 }, $set: { lastFollowUpAt: new Date() } },
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
router.get('/:id/proposal', projectsAdminLimiter, requireAdminKey, async (req, res, next) => {
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
router.patch('/:id', projectsAdminLimiter, requireAdminKey, async (req, res, next) => {
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
  // GET /api/projects/:id/download-photos — baixa todas as fotos em um zip
router.get('/:id/download-photos', projectsAdminLimiter, requireAdminKey, async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: { message: 'Projeto não encontrado' } });
    }
    if (!project.photoUrls || project.photoUrls.length === 0) {
      return res.status(404).json({ error: { message: 'Este projeto não tem fotos' } });
    }

    res.attachment(`fotos-${project.clientName}.zip`);
    const archive = new ZipArchive();
    archive.pipe(res);

    for (let i = 0; i < project.photoUrls.length; i++) {
      const url = project.photoUrls[i];
      const response = await fetch(url);
      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = url.split('.').pop().split('?')[0];
      archive.append(buffer, { name: `foto-${String(i + 1).padStart(2, '0')}.${ext}` });
    }

    await archive.finalize();
  } catch (error) {
    next(error);
  }
});

// DELETE /api/projects/:id — admin, remove
router.delete('/:id', projectsAdminLimiter, requireAdminKey, async (req, res, next) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) {
      return res.status(404).json({ error: { message: 'Projeto não encontrado' } });
    }

    logAudit('project_deleted', {
      projectId: String(project._id),
      status: project.status,
      createdAt: project.createdAt,
      ip: maskIp(req.ip),
    });

    res.json({ data: { _id: project._id } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;