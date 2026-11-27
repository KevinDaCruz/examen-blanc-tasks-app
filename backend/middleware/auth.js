/**
 * @file Middleware d'authentification JWT.
 * @module middleware/auth
 */
const jwt = require('jsonwebtoken');
const config = require('../config/env');

/** Nom du cookie HttpOnly qui transporte le JWT. */
const COOKIE_NAME = 'token';

/**
 * Vérifie le JWT et expose l'utilisateur dans `req.user` (`{ id }`).
 *
 * Le token est lu dans un cookie **HttpOnly** (inaccessible au JavaScript du
 * navigateur, donc non volable via une faille XSS) au lieu de `localStorage`.
 * L'algorithme est imposé (`HS256`) pour éviter les attaques par confusion d'algorithme.
 *
 * Réponses : 401 si le token est absent, invalide ou expiré (avant : 418 « I'm a teapot »).
 *
 * @type {express.RequestHandler}
 */
function auth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ msg: 'Authentification requise' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    req.user = decoded.user;
    return next();
  } catch {
    return res.status(401).json({ msg: 'Session expirée ou invalide, veuillez vous reconnecter' });
  }
}

module.exports = auth;
module.exports.COOKIE_NAME = COOKIE_NAME;
