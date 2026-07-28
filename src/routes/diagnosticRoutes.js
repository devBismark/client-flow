const express = require('express');
const { DiagnosticLead } = require('../models/DiagnosticLead');
const { notifyNewDiagnostic } = require('../services/notificationService');
const router = express.Router();

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

module.exports = router;
