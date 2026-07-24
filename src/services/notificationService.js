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

  return [
    '*Novo briefing recebido*',
    '',
    `*Cliente:* ${escapeMarkdown(project.clientName)}`,
    `*Contacto:* ${escapeMarkdown(project.clientContact)}`,
    '',
    respostas,
    '',
    `*Pacote sugerido:* ${TIER_LABEL[project.suggestedTier]}`,
    `*Faixa:* ${pricing.min}–${pricing.max}€ \\(entrada ${pricing.min / 2}€\\)`,
  ].join('\n');
}

async function notifyNewBriefing(project, pricing) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('Telegram não configurado — notificação ignorada');
    return { sent: false, reason: 'not_configured' };
  }

  try {
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

    return { sent: true };
  } catch (error) {
    console.error('Falha ao notificar via Telegram:', error.message);
    return { sent: false, reason: 'network_error' };
  }
}

module.exports = { notifyNewBriefing, buildMessage };