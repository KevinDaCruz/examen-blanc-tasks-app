/**
 * @file Gestion centralisée des erreurs et des routes inconnues.
 * @module middleware/errorHandler
 */
const logger = require('../config/logger');
const config = require('../config/env');

/**
 * Route inconnue => 404 JSON (au lieu de la page HTML par défaut d'Express).
 * @type {express.RequestHandler}
 */
function notFound(req, res) {
  res.status(404).json({ msg: 'Ressource introuvable' });
}

/**
 * Gestionnaire d'erreurs final.
 * Avec Express 5, les erreurs levées dans les handlers `async` (promesses rejetées)
 * arrivent ici automatiquement : elles ne font plus planter ni bloquer le serveur.
 * Le détail technique est journalisé, jamais renvoyé au client en production.
 *
 * @type {express.ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ msg: 'Corps de requête JSON invalide' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ msg: 'Requête trop volumineuse' });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ msg: Object.values(err.errors)[0]?.message || 'Données invalides' });
  }
  if (err.code === 11000) {
    return res.status(409).json({ msg: 'Cette ressource existe déjà' });
  }

  logger.error(err.message, { stack: err.stack, method: req.method, url: req.originalUrl });
  return res.status(err.status || 500).json({
    msg: 'Erreur interne du serveur',
    ...(config.isProd ? {} : { detail: err.message }),
  });
}

module.exports = { notFound, errorHandler };
