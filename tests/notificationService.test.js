const { buildMessage, buildDiagnosticMessage } = require('../src/services/notificationService');

describe('escapeMarkdown — escapa barra invertida (\\)', () => {
  test('buildMessage escapa \\ nos campos do briefing', () => {
    const project = {
      clientName: 'Cliente\\Teste',
      clientContact: 'contato@teste.com',
      briefingAnswers: {},
      suggestedTier: 'essencial',
    };
    const pricing = { min: 150, max: 200 };

    const mensagem = buildMessage(project, pricing);

    expect(mensagem).toContain('Cliente\\\\Teste');
  });

  test('buildDiagnosticMessage escapa \\ nos campos do lead', () => {
    const lead = {
      nomeEmpresa: 'Empresa\\Teste',
      contato: 'contato@teste.com',
      categorias: ['automacoes'],
      descricaoBreve: 'Descrição com \\ barra invertida',
    };

    const mensagem = buildDiagnosticMessage(lead);

    expect(mensagem).toContain('Empresa\\\\Teste');
    expect(mensagem).toContain('Descrição com \\\\ barra invertida');
  });
});
