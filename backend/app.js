/**
 * @file Construction de l'application Express (sans écoute réseau, pour pouvoir la tester avec supertest).
 * @module app
 */
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const config = require('./config/env');
const logger = require('./config/logger');
const { metricsMiddleware, metricsAuth, metricsHandler } = require('./middleware/metrics');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Derrière nginx / load balancer : nécessaire pour la vraie IP client (rate-limit, logs) et les cookies Secure.
app.set('trust proxy', config.trustProxy);

// En-têtes de sécurité HTTP (CSP, HSTS, X-Content-Type-Options, frameguard…) et suppression de X-Powered-By.
app.use(helmet());

// CORS restreint à une liste blanche d'origines (avant : `cors()` acceptait n'importe quel site).
app.use(
  cors({
    origin: (origin, cb) => {
      // Requêtes sans Origin (curl, sondes de santé, même origine via proxy) : autorisées.
      if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
      logger.audit('cors.rejected', { origin });
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  }),
);

// Taille de corps limitée (anti-DoS) et cookies (JWT HttpOnly).
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// Logs d'accès HTTP -> Winston (format "combined" en prod, plus court en dev).
if (!config.isTest) {
  app.use(morgan(config.isProd ? 'combined' : 'dev', { stream: logger.stream }));
}

app.use(metricsMiddleware);

// Routes
app.use('/api/health', require('./routes/health'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tasks', require('./routes/tasks'));

// Métriques Prometheus : non relayées par nginx (VPS) et protégées par jeton si METRICS_TOKEN est défini (PaaS).
app.get('/metrics', metricsAuth, metricsHandler);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
