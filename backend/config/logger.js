/**
 * @file Journalisation applicative centralisée avec Winston (remplace les console.log).
 *
 * - Développement : sortie console colorée et lisible.
 * - Pré-production / production : sortie JSON structurée sur stdout (collectée par
 *   Docker / l'hébergeur / Loki), et optionnellement dans des fichiers si `LOG_DIR`
 *   est défini (`error.log` pour les erreurs, `combined.log` pour tout, `audit.log`
 *   pour les événements de sécurité), avec rotation par taille.
 * - Le niveau `http` reçoit les logs d'accès produits par morgan.
 * @module config/logger
 */
const path = require('path');
const winston = require('winston');
const config = require('./env');

const { combine, timestamp, errors, json, colorize, printf, splat } = winston.format;

const devFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} ${level}: ${stack || message}${extra}`;
});

const transports = [
  new winston.transports.Console({
    silent: config.isTest,
    format: config.isProd ? json() : combine(colorize(), devFormat),
  }),
];

if (config.logDir) {
  const fileOpts = { maxsize: 5 * 1024 * 1024, maxFiles: 5, tailable: true, format: json() };
  transports.push(
    new winston.transports.File({ ...fileOpts, filename: path.join(config.logDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ ...fileOpts, filename: path.join(config.logDir, 'combined.log') }),
  );
}

/**
 * Logger principal de l'application.
 * @type {winston.Logger}
 * @example logger.info('Serveur démarré', { port: 5000 });
 */
const logger = winston.createLogger({
  level: config.logLevel,
  defaultMeta: { service: 'tasks-api', env: config.env },
  format: combine(timestamp(), errors({ stack: true }), splat()),
  transports,
});

/**
 * Journal d'audit sécurité (connexions, échecs, accès refusés…).
 * Séparé du log applicatif pour pouvoir être conservé plus longtemps et analysé.
 * @param {string} event - Identifiant de l'événement (ex: `auth.login_failed`).
 * @param {object} [details] - Contexte (ip, userId…). Ne jamais y mettre de mot de passe ni de token.
 */
logger.audit = (event, details = {}) => logger.warn('AUDIT', { audit: true, event, ...details });

if (config.logDir) {
  logger.add(
    new winston.transports.File({
      filename: path.join(config.logDir, 'audit.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 10,
      format: combine(winston.format((info) => (info.audit ? info : false))(), json()),
    }),
  );
}

/** Flux utilisé par morgan pour envoyer les logs d'accès HTTP vers Winston. */
logger.stream = { write: (message) => logger.http(message.trim()) };

module.exports = logger;
