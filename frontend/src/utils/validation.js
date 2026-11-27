/**
 * @file Règles de validation côté client (identiques à celles du backend Joi).
 * @module utils/validation
 */

/**
 * Vérifie les règles du formulaire d'inscription (mêmes règles que le backend).
 * @param {{username: string, password: string, confirm: string}} values
 * @returns {string} Message d'erreur, ou chaîne vide si tout est valide.
 */
export function validateRegister({ username, password, confirm }) {
  if (!username.trim() || !password) return 'Tous les champs sont obligatoires.';
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username.trim()))
    return "Le nom d'utilisateur doit faire 3 à 30 caractères (lettres, chiffres, « . », « _ », « - »).";
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
    return 'Le mot de passe doit faire au moins 8 caractères avec au moins une lettre et un chiffre.';
  if (password !== confirm) return 'Les mots de passe ne correspondent pas.';
  return '';
}
