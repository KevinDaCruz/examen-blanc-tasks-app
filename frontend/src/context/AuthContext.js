/**
 * @file Contexte d'authentification (React Context API).
 * @module context/AuthContext
 */
import { createContext, useContext } from 'react';

/**
 * @typedef {object} AuthValue
 * @property {{_id: string, username: string}|null} user - Utilisateur connecté, ou `null`.
 * @property {boolean} loading - Vrai pendant la vérification initiale de la session.
 * @property {function(object): void} setUser - Enregistre l'utilisateur après login/inscription.
 * @property {function(): Promise<void>} logout - Déconnecte (supprime le cookie côté serveur).
 */

/** @type {React.Context} */
export const AuthContext = createContext(null);

/**
 * Hook d'accès au contexte d'authentification.
 * @returns {AuthValue}
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}
