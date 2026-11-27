/**
 * @file Point d'entrée du serveur backend.
 *
 * Correction : le serveur n'écoute qu'une fois MongoDB connecté (avant, il acceptait
 * des requêtes alors que la base n'était pas prête), et il s'arrête proprement sur
 * SIGTERM/SIGINT (redéploiement Docker sans couper les requêtes en cours).
 * @module server
 */
const config = require('./config/env');
const logger = require('./config/logger');
const { connectDB } = require('./config/db');
const mongoose = require('mongoose');
const app = require('./app');

/**
 * Démarre la connexion à la base puis le serveur HTTP.
 * @returns {Promise<http.Server>}
 */
async function start() {
  await connectDB(config.mongoUri);
  const server = app.listen(config.port, () => {
    logger.info(`API démarrée sur le port ${config.port}`, { env: config.env });
  });

  const shutdown = (signal) => {
    logger.info(`${signal} reçu, arrêt en cours…`);
    server.close(async () => {
      await mongoose.connection.close();
      logger.info('Arrêt terminé');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

process.on('unhandledRejection', (reason) => {
  logger.error('Promesse rejetée non gérée', { reason: reason instanceof Error ? reason.stack : reason });
});
process.on('uncaughtException', (err) => {
  logger.error('Exception non capturée, arrêt du processus', { stack: err.stack });
  process.exit(1);
});

start().catch((err) => {
  logger.error('Impossible de démarrer le serveur', { error: err.message });
  process.exit(1);
});
