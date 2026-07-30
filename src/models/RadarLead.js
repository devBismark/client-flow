const mongoose = require('mongoose');

const STATUSES = [
  'novo',
  'analisado',
  'mensagem_gerada',
  'aprovado_contato',
  'contatado',
  'respondeu',
  'reuniao_marcada',
  'proposta_enviada',
  'fechado',
  'perdido',
];

const PRIORITIES = ['baixa', 'media', 'alta', 'urgente'];

const radarLeadSchema = new mongoose.Schema(
  {
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RadarCampaign',
      required: true,
      index: true,
    },
    nomeEmpresa: {
      type: String,
      required: [true, 'Nome da empresa é obrigatório'],
      trim: true,
      maxlength: 120,
    },
    nicho: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    cidade: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    pais: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    site: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
    instagram: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
    telefone: {
      type: String,
      trim: true,
      maxlength: 60,
      default: '',
    },
    googleMapsUrl: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    observacoes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'novo',
    },
    prioridade: {
      type: String,
      enum: PRIORITIES,
      default: 'media',
    },
    temSite: {
      type: Boolean,
      default: false,
    },
    siteProfissional: {
      type: Boolean,
      default: false,
    },
    siteResponsivo: {
      type: Boolean,
      default: false,
    },
    temWhatsapp: {
      type: Boolean,
      default: false,
    },
    temFormulario: {
      type: Boolean,
      default: false,
    },
    temPaginaServicos: {
      type: Boolean,
      default: false,
    },
    googleMapsPresente: {
      type: Boolean,
      default: false,
    },
    instagramAtivo: {
      type: Boolean,
      default: false,
    },
    parecePrecisarLandingPage: {
      type: Boolean,
      default: false,
    },
    parecePrecisarAutomacao: {
      type: Boolean,
      default: false,
    },
    parecePrecisarSistema: {
      type: Boolean,
      default: false,
    },
    problemasEncontrados: {
      type: [String],
      default: [],
    },
    solucaoRecomendada: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    produtoRecomendado: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
    analisadoEm: {
      type: Date,
    },
  },
  { timestamps: true }
);

const ANALYSIS_FIELDS = [
  'temSite',
  'siteProfissional',
  'siteResponsivo',
  'temWhatsapp',
  'temFormulario',
  'temPaginaServicos',
  'googleMapsPresente',
  'instagramAtivo',
  'parecePrecisarLandingPage',
  'parecePrecisarAutomacao',
  'parecePrecisarSistema',
  'problemasEncontrados',
  'solucaoRecomendada',
  'produtoRecomendado',
];

const RadarLead = mongoose.model('RadarLead', radarLeadSchema);

module.exports = { RadarLead, STATUSES, PRIORITIES, ANALYSIS_FIELDS };
