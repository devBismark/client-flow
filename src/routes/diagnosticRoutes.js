const express = require('express');
const { DiagnosticLead, STATUSES, CATEGORIES, PRIORITIES, ORIGINS } = require('../models/DiagnosticLead');
const { notifyNewDiagnostic } = require('../services/notificationService');
const { requireAdminKey } = require('../middlewares/auth');
const { createRateLimiter } = require('../middlewares/rateLimiter');
const router = express.Router();

const diagnosticsAdminLimiter = createRateLimiter({
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

    const filter = {};

    if (req.query.status !== undefined) {
      if (!STATUSES.includes(req.query.status)) {
        return res.status(400).json({ error: { message: 'Status inválido', allowed: STATUSES } });
      }
      filter.status = req.query.status;
    }

    if (req.query.categoria !== undefined) {
      if (!CATEGORIES.includes(req.query.categoria)) {
        return res.status(400).json({ error: { message: 'Categoria inválida', allowed: CATEGORIES } });
      }
      filter.categorias = req.query.categoria;
    }

    if (req.query.origem !== undefined) {
      if (!ORIGINS.includes(req.query.origem)) {
        return res.status(400).json({ error: { message: 'Origem inválida', allowed: ORIGINS } });
      }
      filter.origem = req.query.origem;
    }

    const [items, total] = await Promise.all([
      DiagnosticLead.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      DiagnosticLead.countDocuments(filter),
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

// PATCH /api/diagnostics/:id/status — admin, atualiza status
router.patch('/:id/status', diagnosticsAdminLimiter, requireAdminKey, async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!STATUSES.includes(status)) {
      return res.status(400).json({
        error: { message: 'Status inválido', allowed: STATUSES },
      });
    }

    const lead = await DiagnosticLead.findByIdAndUpdate(
      req.params.id,
      { status },
      { returnDocument: 'after', runValidators: true }
    );

    if (!lead) {
      return res.status(404).json({ error: { message: 'Lead não encontrado' } });
    }

    logAudit('diagnostic_lead_status_updated', {
      leadId: String(lead._id),
      status: lead.status,
      ip: maskIp(req.ip),
    });

    res.json({ data: lead });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/diagnostics/:id/note — admin, atualiza nota interna
router.patch('/:id/note', diagnosticsAdminLimiter, requireAdminKey, async (req, res, next) => {
  try {
    const { notaInterna } = req.body;

    const lead = await DiagnosticLead.findByIdAndUpdate(
      req.params.id,
      { notaInterna },
      { returnDocument: 'after', runValidators: true }
    );

    if (!lead) {
      return res.status(404).json({ error: { message: 'Lead não encontrado' } });
    }

    logAudit('diagnostic_lead_note_updated', {
      leadId: String(lead._id),
      noteLength: lead.notaInterna ? lead.notaInterna.length : 0,
      ip: maskIp(req.ip),
    });

    res.json({ data: lead });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/diagnostics/:id/priority — admin, atualiza prioridade
router.patch('/:id/priority', diagnosticsAdminLimiter, requireAdminKey, async (req, res, next) => {
  try {
    const { prioridade } = req.body;

    if (!PRIORITIES.includes(prioridade)) {
      return res.status(400).json({
        error: { message: 'Prioridade inválida', allowed: PRIORITIES },
      });
    }

    const leadAntes = await DiagnosticLead.findById(req.params.id);
    if (!leadAntes) {
      return res.status(404).json({ error: { message: 'Lead não encontrado' } });
    }

    const from = leadAntes.prioridade;

    const lead = await DiagnosticLead.findByIdAndUpdate(
      req.params.id,
      { prioridade },
      { returnDocument: 'after', runValidators: true }
    );

    logAudit('diagnostic_lead_priority_updated', {
      leadId: String(lead._id),
      from,
      to: lead.prioridade,
      ip: maskIp(req.ip),
    });

    res.json({ data: lead });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/diagnostics/:id/proposal-draft — admin, atualiza rascunho interno de proposta
router.patch('/:id/proposal-draft', diagnosticsAdminLimiter, requireAdminKey, async (req, res, next) => {
  try {
    const { propostaRascunho } = req.body;

    const lead = await DiagnosticLead.findByIdAndUpdate(
      req.params.id,
      { propostaRascunho },
      { returnDocument: 'after', runValidators: true }
    );

    if (!lead) {
      return res.status(404).json({ error: { message: 'Lead não encontrado' } });
    }

    logAudit('diagnostic_lead_proposal_draft_updated', {
      leadId: String(lead._id),
      draftLength: lead.propostaRascunho ? lead.propostaRascunho.length : 0,
      ip: maskIp(req.ip),
    });

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

router.maskIp = maskIp;

module.exports = router;
