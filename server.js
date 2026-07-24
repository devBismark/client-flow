require('dotenv').config();

const app = require('./app');
const { connectDatabase } = require('./src/config/db');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await connectDatabase();

    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  } catch (error) {
    console.error('Falha ao iniciar o servidor:', error.message);
    process.exit(1);
  }
}

startServer();