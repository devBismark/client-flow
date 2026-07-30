const express = require('express');
const { RadarLead, STATUSES, PRIORITIES, ANALYSIS_FIELDS } = require('../models/RadarLead');
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

const MAX_IMPORT_LINES = 500;

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function parseImportLine(line) {
  const parts = line.split(';');
  const [nomeEmpresa, cidade, pais, site, instagram, email, telefone, ...rest] = parts;
  return {
    nomeEmpresa: (nomeEmpresa || '').trim(),
    cidade: (cidade || '').trim(),
    pais: (pais || '').trim(),
    site: (site || '').trim(),
    instagram: (instagram || '').trim(),
    email: (email || '').trim(),
    telefone: (telefone || '').trim(),
    observacoes: rest.join(';').trim(),
  };
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

// POST /api/radar/campaigns/:campaignId/leads/import — admin, importa leads em lote a partir de texto colado
router.post('/import', requireAdminKey, async (req, res, next) => {
  try {
    const campaign = await loadCampaignOr404(req, res);
    if (!campaign) return;

    const { texto } = req.body;
    if (typeof texto !== 'string' || !texto.trim()) {
      return res.status(400).json({ error: { message: 'Nenhum texto para importar' } });
    }

    const linhas = texto
      .split('\n')
      .map((linha) => linha.trim())
      .filter((linha) => linha.length > 0);

    if (linhas.length === 0) {
      return res.status(400).json({ error: { message: 'Nenhum texto para importar' } });
    }

    if (linhas.length > MAX_IMPORT_LINES) {
      return res.status(400).json({
        error: { message: `Máximo de ${MAX_IMPORT_LINES} linhas por importação`, limit: MAX_IMPORT_LINES },
      });
    }

    const existentes = await RadarLead.find({ campaign_id: campaign._id })
      .select('nomeEmpresa cidade email telefone')
      .lean();

    const assinaturas = {
      email: new Set(existentes.filter((l) => l.email).map((l) => normalize(l.email))),
      telefone: new Set(existentes.filter((l) => l.telefone).map((l) => normalize(l.telefone))),
      nomeCidade: new Set(existentes.map((l) => `${normalize(l.nomeEmpresa)}|${normalize(l.cidade)}`)),
    };

    const results = [];
    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < linhas.length; i += 1) {
      const numeroLinha = i + 1;
      const dados = parseImportLine(linhas[i]);

      if (!dados.nomeEmpresa) {
        errors += 1;
        results.push({ line: numeroLinha, status: 'error', reason: 'nomeEmpresa é obrigatório' });
        continue;
      }

      const emailNorm = normalize(dados.email);
      const telefoneNorm = normalize(dados.telefone);
      const nomeCidadeNorm = `${normalize(dados.nomeEmpresa)}|${normalize(dados.cidade)}`;

      const isDuplicate =
        (emailNorm && assinaturas.email.has(emailNorm)) ||
        (telefoneNorm && assinaturas.telefone.has(telefoneNorm)) ||
        assinaturas.nomeCidade.has(nomeCidadeNorm);

      if (isDuplicate) {
        skipped += 1;
        results.push({ line: numeroLinha, status: 'skipped', reason: 'duplicado nesta campanha' });
        continue;
      }

      try {
        const lead = await RadarLead.create({
          campaign_id: campaign._id,
          ...dados,
        });

        if (emailNorm) assinaturas.email.add(emailNorm);
        if (telefoneNorm) assinaturas.telefone.add(telefoneNorm);
        assinaturas.nomeCidade.add(nomeCidadeNorm);

        created += 1;
        results.push({ line: numeroLinha, status: 'created', lead });
      } catch (error) {
        errors += 1;
        results.push({ line: numeroLinha, status: 'error', reason: error.message });
      }
    }

    logAudit('radar_lead_import', {
      campaignId: String(campaign._id),
      total: linhas.length,
      created,
      skipped,
      errors,
      ip: maskIp(req.ip),
    });

    res.json({
      data: {
        summary: { total: linhas.length, created, skipped, errors },
        results,
      },
    });
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
      temSite,
      siteProfissional,
      siteResponsivo,
      temWhatsapp,
      temFormulario,
      temPaginaServicos,
      googleMapsPresente,
      instagramAtivo,
      parecePrecisarLandingPage,
      parecePrecisarAutomacao,
      parecePrecisarSistema,
      problemasEncontrados,
      solucaoRecomendada,
      produtoRecomendado,
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
    if (temSite !== undefined) updates.temSite = temSite;
    if (siteProfissional !== undefined) updates.siteProfissional = siteProfissional;
    if (siteResponsivo !== undefined) updates.siteResponsivo = siteResponsivo;
    if (temWhatsapp !== undefined) updates.temWhatsapp = temWhatsapp;
    if (temFormulario !== undefined) updates.temFormulario = temFormulario;
    if (temPaginaServicos !== undefined) updates.temPaginaServicos = temPaginaServicos;
    if (googleMapsPresente !== undefined) updates.googleMapsPresente = googleMapsPresente;
    if (instagramAtivo !== undefined) updates.instagramAtivo = instagramAtivo;
    if (parecePrecisarLandingPage !== undefined) updates.parecePrecisarLandingPage = parecePrecisarLandingPage;
    if (parecePrecisarAutomacao !== undefined) updates.parecePrecisarAutomacao = parecePrecisarAutomacao;
    if (parecePrecisarSistema !== undefined) updates.parecePrecisarSistema = parecePrecisarSistema;
    if (problemasEncontrados !== undefined) updates.problemasEncontrados = problemasEncontrados;
    if (solucaoRecomendada !== undefined) updates.solucaoRecomendada = solucaoRecomendada;
    if (produtoRecomendado !== undefined) updates.produtoRecomendado = produtoRecomendado;

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

    const analiseAtualizada = ANALYSIS_FIELDS.some((field) => req.body[field] !== undefined);

    if (analiseAtualizada) {
      updates.analisadoEm = new Date();

      if (updates.status === undefined) {
        const leadAtual = await RadarLead.findOne({ _id: req.params.id, campaign_id: campaign._id }).select('status');
        if (leadAtual && leadAtual.status === 'novo') {
          updates.status = 'analisado';
        }
      }
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
