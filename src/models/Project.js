const mongoose = require('mongoose');

const TIERS = ['essencial', 'profissional', 'premium'];
const STATUSES = ['briefing', 'orcamento_enviado', 'aprovado', 'em_producao', 'entregue'];

const briefingAnswersSchema = new mongoose.Schema(
  {
    multiploServicos: { type: Boolean, default: false },
    querAparecerGoogle: { type: Boolean, default: false },
    temConcorrenteReferencia: { type: Boolean, default: false },
    querInteracao: { type: Boolean, default: false },
    materialDeSobra: { type: Boolean, default: false },
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    clientName: {
      type: String,
      required: [true, 'Nome do cliente é obrigatório'],
      trim: true,
      maxlength: 120,
    },
    clientContact: {
      type: String,
      required: [true, 'Contato do cliente é obrigatório'],
      trim: true,
      maxlength: 200,
    },
    briefingAnswers: {
      type: briefingAnswersSchema,
      required: true,
    },
    sobreNegocio: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    objetivoPagina: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    referencias: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    suggestedTier: {
      type: String,
      enum: TIERS,
      required: true,
    },
    finalTier: {
      type: String,
      enum: TIERS,
      default: null,
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'briefing',
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
  },
  { timestamps: true }
);

const Project = mongoose.model('Project', projectSchema);

module.exports = { Project, TIERS, STATUSES };