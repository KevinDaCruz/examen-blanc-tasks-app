/**
 * @file Métriques Prometheus (supervision E26).
 *
 * Expose sur `GET /metrics` (non publié par le reverse-proxy) :
 * - les métriques Node.js par défaut (CPU, mémoire, event loop, GC…),
 * - `http_requests_total{method,route,status_code}` : compteur de requêtes,
 * - `http_request_duration_seconds{method,route,status_code}` : histogramme de latence.
 * - `auth_login_failures_total` : échecs de connexion (détection de brute force).
 *
 * Ces séries alimentent les alertes « API down », « latence p95 > 500 ms »
 * et « taux d'erreurs 5xx > 5 % » (voir `monitoring/prometheus/alert.rules.yml`).
 * @module middleware/metrics
 */
const client = require('prom-client');

const register = new client.Registry();
register.setDefaultLabels({ app: 'tasks-api' });
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Nombre total de requêtes HTTP',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durée des requêtes HTTP en secondes',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

/** Compteur des échecs de connexion, incrémenté par la route POST /api/auth/login. */
const authLoginFailures = new client.Counter({
  name: 'auth_login_failures_total',
  help: 'Nombre de tentatives de connexion échouées',
  registers: [register],
});

/**
 * Mesure chaque requête. La route utilisée comme label est le *pattern* Express
 * (`/api/tasks/:id`) et non l'URL réelle, pour éviter l'explosion de cardinalité.
 * @type {express.RequestHandler}
 */
function metricsMiddleware(req, res, next) {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    const labels = { method: req.method, route, status_code: res.statusCode };
    end(labels);
    httpRequestsTotal.inc(labels);
  });
  next();
}

/**
 * Handler de `GET /metrics` au format texte Prometheus.
 * @type {express.RequestHandler}
 */
async function metricsHandler(req, res) {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}

module.exports = { metricsMiddleware, metricsHandler, register, authLoginFailures };
