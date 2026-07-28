const { CATEGORY_LABELS } = require('../models/DiagnosticLead');

const TIER_LABEL = {
  essencial: 'Essencial',
  profissional: 'Profissional',
  premium: 'Premium',
};

const ANSWER_LABEL = {
  multiploServicos: 'Múltiplos serviços',
  querAparecerGoogle: 'Quer aparecer no Google',
  temConcorrenteReferencia: 'Tem site de referência',
  querInteracao: 'Quer interação/animação',
  materialDeSobra: 'Já tem material',
};

function escapeMarkdown(text) {
  return String(text).replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

function buildMessage(project, pricing) {
  const respostas = Object.entries(ANSWER_LABEL)
    .map(([key, label]) => `${project.briefingAnswers?.[key] ? '✅' : '➖'} ${label}`)
    .join('\n');

  const linhas = [
    '*Novo briefing recebido*',
    '',
    `*Cliente:* ${escapeMarkdown(project.clientName)}`,
    `*Contacto:* ${escapeMarkdown(project.clientContact)}`,
  ];

  if (project.sobreNegocio) {
    linhas.push('', `*Negócio:* ${escapeMarkdown(project.sobreNegocio)}`);
  }
  if (project.objetivoPagina) {
    linhas.push('', `*Objetivo:* ${escapeMarkdown(project.objetivoPagina)}`);
  }
  if (project.referencias) {
    linhas.push('', `*Referências:* ${escapeMarkdown(project.referencias)}`);
  }

  linhas.push(
    '',
    respostas,
    '',
    `*Pacote sugerido:* ${TIER_LABEL[project.suggestedTier]}`,
    `*Faixa:* ${pricing.min}–${pricing.max}€ \\(entrada ${pricing.min / 2}€\\)`
  );

  return linhas.join('\n');
}

// Envia até 10 fotos como álbum. Usa multipart/form-data com attach:// —
// o fetch nativo do Node monta o boundary sozinho quando o body é um FormData.
async function sendMediaGroup(chatId, token, photos) {
  const formData = new FormData();
  formData.append('chat_id', chatId);

  const media = photos.map((_file, index) => ({
    type: 'photo',
    media: `attach://photo${index}`,
  }));
  media[0].caption = '📋 Novo briefing com fotos em anexo';

  formData.append('media', JSON.stringify(media));

  photos.forEach((file, index) => {
    const blob = new Blob([file.buffer], { type: file.mimetype });
    formData.append(`photo${index}`, blob, file.originalname || `foto${index}.jpg`);
  });

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('Telegram (sendMediaGroup) respondeu com erro:', res.status, body);
    return { sent: false, reason: 'api_error' };
  }

  return { sent: true };
}

async function notifyNewBriefing(project, pricing, photos = [], photoUrls = []) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('Telegram não configurado — notificação ignorada');
    return { sent: false, reason: 'not_configured' };
  }

  try {
    if (photos && photos.length > 0) {
      await sendMediaGroup(chatId, token, photos);
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildMessage(project, pricing),
        parse_mode: 'MarkdownV2',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('Telegram respondeu com erro:', res.status, body);
      return { sent: false, reason: 'api_error' };
    }

    if (photoUrls && photoUrls.length > 0) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `Links permanentes das fotos:\n${photoUrls.join('\n')}`,
          disable_web_page_preview: true,
        }),
      });
    }

    return { sent: true };
  } catch (error) {
    console.error('Falha ao notificar via Telegram:', error.message);
    return { sent: false, reason: 'network_error' };
  }
}

// --- Diagnóstico geral (/diagnostico) — aditivo, não altera o fluxo do briefing acima ---

function buildDiagnosticMessage(lead) {
  const categoriasLabel = (lead.categorias || [])
    .map((categoria) => CATEGORY_LABELS[categoria] || categoria)
    .join(', ');

  const linhas = [
    '*Novo diagnóstico recebido*',
    '_Origem: /diagnostico — briefing geral_',
    '',
    `*Nome/Empresa:* ${escapeMarkdown(lead.nomeEmpresa)}`,
    `*Contacto:* ${escapeMarkdown(lead.contato)}`,
    `*Categoria\\(s\\):* ${escapeMarkdown(categoriasLabel)}`,
    '',
    `*Descrição:* ${escapeMarkdown(lead.descricaoBreve)}`,
  ];

  if (lead.estagioAtual) {
    linhas.push('', `*Estágio atual:* ${escapeMarkdown(lead.estagioAtual)}`);
  }
  if (lead.urgencia) {
    linhas.push('', `*Urgência:* ${escapeMarkdown(lead.urgencia)}`);
  }

  return linhas.join('\n');
}

async function notifyNewDiagnostic(lead) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('Telegram não configurado — notificação de diagnóstico ignorada');
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildDiagnosticMessage(lead),
        parse_mode: 'MarkdownV2',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('Telegram (diagnóstico) respondeu com erro:', res.status, body);
      return { sent: false, reason: 'api_error' };
    }

    return { sent: true };
  } catch (error) {
    console.error('Falha ao notificar diagnóstico via Telegram:', error.message);
    return { sent: false, reason: 'network_error' };
  }
}

module.exports = { notifyNewBriefing, buildMessage, notifyNewDiagnostic, buildDiagnosticMessage };