/**
 * @file Client HTTP (axios) partagé par toute l'application.
 * @module api
 */
import axios from 'axios';

/**
 * Instance axios configurée pour l'API.
 *
 * - `baseURL` : vient de `VITE_API_URL` (différent par environnement : dev, pré-prod, prod).
 *   Par défaut `/api` : même origine, proxifiée par Vite en dev et par nginx en production.
 *   (Avant : `http://localhost:5000/api` en dur, inutilisable une fois déployé.)
 * - `withCredentials` : envoie le cookie de session HttpOnly. Le token n'est plus
 *   stocké dans `localStorage` ni ajouté à la main dans un en-tête.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  timeout: 10000,
});

/**
 * Extrait un message d'erreur lisible pour l'utilisateur depuis une erreur axios.
 * @param {unknown} err - Erreur levée par axios.
 * @param {string} [fallback] - Message par défaut.
 * @returns {string}
 */
export function getErrorMessage(err, fallback = 'Une erreur est survenue, veuillez réessayer.') {
  if (err?.response?.data?.msg) return err.response.data.msg;
  if (err?.code === 'ECONNABORTED' || !err?.response) return 'Serveur injoignable, vérifiez votre connexion.';
  return fallback;
}

export default api;
