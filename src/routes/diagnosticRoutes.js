const express = require('express');
const { DiagnosticLead } = require('../models/DiagnosticLead');
const { notifyNewDiagnostic } = require('../services/notificationService');
const { requireAdminKey } = require('../middlewares/auth');
const { createRateLimiter } = require('../middlewares/rateLimiter');
const router = express.Router();

const diagnosticsAdminLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 60,
  methods: ['GET', 'DELETE'],
});

function maskIp(ip) {
  if (!ip) return null;
  return ip.replace(/\.\d+$/, '.xxx');
}

function logAudit(event, data) {
  console.info(`[audit] ${JSON.stringify({ event, ...data, at: new Date().toISOString() })}`);
}

// POST /api/diagnostics — público (triagem geral do /diagnostico)
router.post('/', async (req, res, next) => {
  try {
    const { nomeEmpresa, contato, categorias, descricaoBreve, estagioAtual, urgencia } = req.body;

    if (
      Array.isArray(categorias) &&
      categorias.length === 1 &&
      categorias[0] === 'sites_landing_pages'
    ) {
      return res.status(400).json({
        error: {
          message:
            'Esta frente é atendida pelo briefing específico de sites e landing pages, não pelo diagnóstico geral',
        },
        redirectTo: '/',
      });
    }

    const lead = await DiagnosticLead.create({
      nomeEmpresa,
      contato,
      categorias,
      descricaoBreve,
      estagioAtual,
      urgencia,
    });

    res.status(201).json({ data: lead });

    notifyNewDiagnostic(lead).catch((err) => {
      console.error('Falha ao notificar novo diagnóstico:', err.message);
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/diagnostics — admin, lista paginada
router.get('/', diagnosticsAdminLimiter, requireAdminKey, async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const [items, total] = await Promise.all([
      DiagnosticLead.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      DiagnosticLead.countDocuments(),
    ]);

    res.json({ data: items, meta: { page, limit, total } });
  } catch (error) {
    next(error);
  }
});

// GET /api/diagnostics/:id — admin, detalhe
router.get('/:id', diagnosticsAdminLimiter, requireAdminKey, async (req, res, next) => {
  try {
    const lead = await DiagnosticLead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: { message: 'Lead não encontrado' } });
    }
    res.json({ data: lead });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/diagnostics/:id — admin, remove
router.delete('/:id', diagnosticsAdminLimiter, requireAdminKey, async (req, res, next) => {
  try {
    const lead = await DiagnosticLead.findByIdAndDelete(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: { message: 'Lead não encontrado' } });
    }

    logAudit('diagnostic_lead_deleted', {
      leadId: String(lead._id),
      categorias: lead.categorias,
      createdAt: lead.createdAt,
      ip: maskIp(req.ip),
    });

    res.json({ data: { _id: lead._id } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
