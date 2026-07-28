const mongoose = require('mongoose');

const CATEGORIES = [
  'sistemas_agentes_ia',
  'sites_landing_pages',
  'automacoes',
  'saas_produtos_digitais',
  'apis_integracoes',
  'ainda_nao_sei',
];

const CATEGORY_LABELS = {
  sistemas_agentes_ia: 'Sistemas inteligentes e agentes de IA',
  sites_landing_pages: 'Sites e landing pages',
  automacoes: 'Automações',
  saas_produtos_digitais: 'SaaS e produtos digitais',
  apis_integracoes: 'APIs e integrações',
  ainda_nao_sei: 'Ainda não sei',
};

const STATUSES = ['novo', 'em_analise', 'proposta', 'ganho', 'perdido'];
const PRIORITIES = ['baixa', 'media', 'alta'];

const diagnosticLeadSchema = new mongoose.Schema(
  {
    nomeEmpresa: {
      type: String,
      required: [true, 'Nome ou empresa é obrigatório'],
      trim: true,
      maxlength: 120,
    },
    contato: {
      type: String,
      required: [true, 'Contato é obrigatório'],
      trim: true,
      maxlength: 200,
    },
    categorias: {
      type: [{ type: String, enum: CATEGORIES }],
      required: true,
      validate: {
        validator: (value) =>
          Array.isArray(value) &&
          value.length > 0 &&
          value.length <= CATEGORIES.length &&
          new Set(value).size === value.length,
        message: `Selecione entre 1 e ${CATEGORIES.length} categorias, sem repetição`,
      },
    },
    descricaoBreve: {
      type: String,
      required: [true, 'Descrição breve é obrigatória'],
      trim: true,
      maxlength: 1000,
    },
    estagioAtual: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    urgencia: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'novo',
    },
    notaInterna: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    prioridade: {
      type: String,
      enum: PRIORITIES,
      default: 'media',
    },
  },
  { timestamps: true }
);

const DiagnosticLead = mongoose.model('DiagnosticLead', diagnosticLeadSchema);

module.exports = { DiagnosticLead, CATEGORIES, CATEGORY_LABELS, STATUSES, PRIORITIES };
