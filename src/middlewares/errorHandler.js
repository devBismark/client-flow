function notFound(req, res) {
  res.status(404).json({ error: { message: 'Rota não encontrada' } });
}

function errorHandler(error, req, res, next) {
  console.error(error);

  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: {
        message: 'Dados inválidos',
        details: Object.values(error.errors).map((e) => e.message),
      },
    });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({ error: { message: 'ID inválido' } });
  }

  res.status(500).json({ error: { message: 'Erro interno do servidor' } });
}

module.exports = { notFound, errorHandler };