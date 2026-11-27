/**
 * @file Sonde de santé pour le load balancer, Docker et la supervision (Uptime Kuma, Prometheus…).
 * @module routes/health
 */
const express = require('express');
const { isDbConnected } = require('../config/db');
const pkg = require('../package.json');

const router = express.Router();

/**
 * État de santé de l'API et de sa dépendance MongoDB.
 *
 * @name GET /api/health
 * @route {GET} /api/health
 * @returns {200} `{ status: 'ok', db: 'up', version, uptime }`
 * @returns {503} `{ status: 'degraded', db: 'down', … }` si MongoDB est injoignable.
 */
router.get('/', (req, res) => {
  const dbUp = isDbConnected();
  res.status(dbUp ? 200 : 503).json({
    status: dbUp ? 'ok' : 'degraded',
    db: dbUp ? 'up' : 'down',
    version: pkg.version,
    uptime: Math.round(process.uptime()),
  });
});

module.exports = router;
