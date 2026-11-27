/**
 * @file Chargement et validation des variables d'environnement.
 *
 * Les secrets (URI MongoDB, clé JWT…) ne sont JAMAIS écrits dans le code :
 * ils viennent du fichier `.env` en local (non versionné, cf. `.gitignore`)
 * et des variables / secrets de l'hébergeur ou de la CI en pré-production
 * et en production.
 *
 * Le serveur refuse de démarrer si la configuration est absente ou trop faible
 * (fail fast) plutôt que de tourner avec un secret prévisible.
 * @module config/env
 */
require('dotenv').config({ quiet: true });
const Joi = require('joi');

/** Secrets connus et trop faibles, refusés même s'ils font la bonne longueur. */
const WEAK_SECRETS = ['secretkey123', 'secret', 'changeme', 'jwt_secret'];

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(5000),
  MONGO_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .required(),
  JWT_SECRET: Joi.string()
    .min(32)
    .invalid(...WEAK_SECRETS)
    .required()
    .messages({
      'string.min': 'JWT_SECRET doit contenir au moins 32 caractères (ex: openssl rand -hex 32)',
    }),
  JWT_EXPIRES_IN: Joi.string().default('1h'),
  /** Liste d'origines autorisées par CORS, séparées par des virgules. */
  CORS_ORIGIN: Joi.string().default('http://localhost:3000'),
  /** Cookie `Secure` (HTTPS uniquement). Vrai par défaut en production. */
  COOKIE_SECURE: Joi.boolean(),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'http', 'debug').default('info'),
  /** Si défini, les logs sont aussi écrits dans des fichiers de ce dossier. */
  LOG_DIR: Joi.string().allow(''),
  /** Nombre de proxys de confiance devant l'API (nginx, load balancer). */
  TRUST_PROXY: Joi.number().integer().min(0).default(1),
}).unknown(true);

const { value, error } = schema.validate(process.env, { abortEarly: false, convert: true });

if (error) {
  // Le logger n'est pas encore disponible ici : on écrit directement sur stderr.
  // eslint-disable-next-line no-console
  console.error(`Configuration invalide :\n - ${error.details.map((d) => d.message).join('\n - ')}`);
  process.exit(1);
}

/**
 * Configuration typée et validée de l'application.
 * @type {{
 *   env: string, isProd: boolean, isTest: boolean, port: number,
 *   mongoUri: string, jwtSecret: string, jwtExpiresIn: string,
 *   corsOrigins: string[], cookieSecure: boolean, logLevel: string,
 *   logDir: (string|undefined), trustProxy: number
 * }}
 */
const config = {
  env: value.NODE_ENV,
  isProd: value.NODE_ENV === 'production',
  isTest: value.NODE_ENV === 'test',
  port: value.PORT,
  mongoUri: value.MONGO_URI,
  jwtSecret: value.JWT_SECRET,
  jwtExpiresIn: value.JWT_EXPIRES_IN,
  corsOrigins: value.CORS_ORIGIN.split(',').map((o) => o.trim()),
  cookieSecure: value.COOKIE_SECURE ?? value.NODE_ENV === 'production',
  logLevel: value.LOG_LEVEL,
  logDir: value.LOG_DIR || undefined,
  trustProxy: value.TRUST_PROXY,
};

module.exports = config;
