/**
 * @file Routes d'authentification : inscription, connexion, déconnexion, session courante.
 * @module routes/auth
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const schemas = require('../validators/schemas');
const config = require('../config/env');
const logger = require('../config/logger');
const { authLoginFailures } = require('../middleware/metrics');

const router = express.Router();
const { COOKIE_NAME } = auth;

/** Coût bcrypt (2^12 itérations). */
const BCRYPT_ROUNDS = 12;

/** Hash factice comparé quand l'utilisateur n'existe pas : temps de réponse constant (anti-énumération). */
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

/**
 * Anti brute-force : 10 tentatives / 15 min / IP sur login et register.
 * Désactivé en environnement de test.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => config.isTest,
  message: { msg: 'Trop de tentatives, réessayez dans quelques minutes' },
  handler: (req, res, _next, options) => {
    logger.audit('auth.rate_limited', { ip: req.ip, path: req.originalUrl });
    res.status(options.statusCode).json(options.message);
  },
});

/** Options du cookie de session : HttpOnly + SameSite=Strict (+ Secure en HTTPS). */
const cookieOptions = () => ({
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: 'strict',
  path: '/',
  maxAge: 60 * 60 * 1000, // 1 h, aligné sur JWT_EXPIRES_IN par défaut
});

/**
 * Signe un JWT pour l'utilisateur et le dépose dans un cookie HttpOnly.
 * Version synchrone : l'ancien `jwt.sign(..., callback)` faisait `throw err`
 * dans le callback, ce qui contournait le try/catch et faisait planter le process.
 * @param {express.Response} res
 * @param {mongoose.Document} user
 */
function issueSession(res, user) {
  const token = jwt.sign({ user: { id: user.id } }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn,
  });
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

/**
 * Inscription d'un nouvel utilisateur.
 *
 * @name POST /api/auth/register
 * @route {POST} /api/auth/register
 * @bodyparam {string} username - 3 à 30 caractères `[a-zA-Z0-9_.-]`.
 * @bodyparam {string} password - 8 caractères min., au moins une lettre et un chiffre.
 * @returns {201} `{ user: { _id, username } }` + cookie de session HttpOnly (connexion automatique).
 * @returns {400} Données invalides (message explicite).
 * @returns {409} Nom d'utilisateur déjà pris.
 * @returns {429} Trop de tentatives.
 */
router.post('/register', authLimiter, validate(schemas.register), async (req, res) => {
  const { username, password } = req.body;

  if (await User.exists({ username })) {
    return res.status(409).json({ msg: "Ce nom d'utilisateur est déjà utilisé" });
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.create({ username, password: hash });

  logger.audit('auth.register', { userId: user.id, ip: req.ip });
  issueSession(res, user);
  return res.status(201).json({ user: { _id: user.id, username: user.username } });
});

/**
 * Connexion.
 *
 * Le message d'erreur est volontairement identique que l'utilisateur existe ou non
 * (anti-énumération des comptes), mais il est maintenant explicite et affiché par le frontend.
 *
 * @name POST /api/auth/login
 * @route {POST} /api/auth/login
 * @bodyparam {string} username
 * @bodyparam {string} password
 * @returns {200} `{ user: { _id, username } }` + cookie de session HttpOnly.
 * @returns {400} Champ manquant.
 * @returns {401} Identifiants incorrects.
 * @returns {429} Trop de tentatives.
 */
router.post('/login', authLimiter, validate(schemas.login), async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username }).select('+password');
  const isMatch = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);

  if (!user || !isMatch) {
    logger.audit('auth.login_failed', { username, ip: req.ip });
    authLoginFailures.inc();
    return res.status(401).json({ msg: "Nom d'utilisateur ou mot de passe incorrect" });
  }

  logger.audit('auth.login_success', { userId: user.id, ip: req.ip });
  issueSession(res, user);
  return res.json({ user: { _id: user.id, username: user.username } });
});

/**
 * Déconnexion : supprime le cookie de session.
 * @name POST /api/auth/logout
 * @route {POST} /api/auth/logout
 * @returns {200} `{ msg }`
 */
router.post('/logout', (req, res) => {
  const { maxAge: _maxAge, ...opts } = cookieOptions();
  res.clearCookie(COOKIE_NAME, opts);
  res.json({ msg: 'Déconnecté' });
});

/**
 * Renvoie l'utilisateur connecté (permet au frontend de savoir s'il a une session
 * valide sans pouvoir lire le cookie HttpOnly).
 * @name GET /api/auth/me
 * @route {GET} /api/auth/me
 * @authentication Cookie `token` requis.
 * @returns {200} `{ user: { _id, username } }`
 * @returns {401} Non connecté ou session expirée.
 */
router.get('/me', auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(401).json({ msg: 'Utilisateur introuvable' });
  return res.json({ user: { _id: user.id, username: user.username } });
});

module.exports = router;
