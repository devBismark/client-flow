const mongoose = require('mongoose');

const STATUSES = ['ativa', 'pausada', 'encerrada'];

const radarCampaignSchema = new mongoose.Schema(
  {
    produto: {
      type: String,
      required: [true, 'Produto é obrigatório'],
      trim: true,
      maxlength: 120,
    },
    nicho: {
      type: String,
      required: [true, 'Nicho é obrigatório'],
      trim: true,
      maxlength: 120,
    },
    cidade: {
      type: String,
      required: [true, 'Cidade é obrigatória'],
      trim: true,
      maxlength: 120,
    },
    objetivo: {
      type: String,
      required: [true, 'Objetivo é obrigatório'],
      trim: true,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'ativa',
    },
    descricao: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
  },
  { timestamps: true }
);

const RadarCampaign = mongoose.model('RadarCampaign', radarCampaignSchema);

module.exports = { RadarCampaign, STATUSES };
