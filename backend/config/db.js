/**
 * @file Connexion à MongoDB via Mongoose.
 * @module config/db
 */
const mongoose = require('mongoose');
const debug = require('debug')('app:db');
const logger = require('./logger');

// Défense en profondeur contre l'injection NoSQL : Mongoose neutralise les
// opérateurs `$` (ex: {"$ne": null}) présents dans les filtres de requêtes.
mongoose.set('sanitizeFilter', true);
mongoose.set('strictQuery', true);

/**
 * Ouvre la connexion MongoDB.
 * Les options `useNewUrlParser` / `useUnifiedTopology` ont été supprimées :
 * elles sont obsolètes depuis le driver MongoDB 4 et ignorées.
 * @param {string} uri - URI de connexion (variable d'environnement `MONGO_URI`).
 * @returns {Promise<Object>} L'instance Mongoose connectée.
 * @throws {Error} Si la connexion échoue (le serveur ne doit alors pas démarrer).
 */
async function connectDB(uri) {
  debug('connexion à %s', uri.replace(/\/\/[^@]*@/, '//***@'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB déconnecté'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnecté'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  logger.info('MongoDB connecté');
  return mongoose;
}

/**
 * Indique si la base de données est joignable (utilisé par la sonde /api/health).
 * @returns {boolean}
 */
function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDB, isDbConnected };
