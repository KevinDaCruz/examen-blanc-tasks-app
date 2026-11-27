/**
 * @file Schémas Joi de validation des entrées utilisateur.
 *
 * Toute donnée venant du client est validée AVANT d'atteindre la base :
 * - types imposés (une chaîne reste une chaîne => bloque l'injection NoSQL `{"$ne": null}`),
 * - longueurs bornées (pas de champs vides ni de payloads énormes),
 * - balises HTML refusées (prévention XSS stockée),
 * - champs inconnus rejetés (pas de mass-assignment, ex: changer le champ `user`).
 * @module validators/schemas
 */
const Joi = require('joi');

/** Refuse toute chaîne contenant une balise HTML (`<script>`, `<img onerror=…>`…). */
const noHtml = (value, helpers) => (/<[^>]*>/.test(value) ? helpers.error('string.html') : value);

const messages = {
  'string.html': '{{#label}} ne doit pas contenir de HTML',
  'string.empty': '{{#label}} est obligatoire',
  'any.required': '{{#label}} est obligatoire',
  'string.min': '{{#label}} doit contenir au moins {{#limit}} caractères',
  'string.max': '{{#label}} doit contenir au plus {{#limit}} caractères',
  'object.unknown': "Le champ {{#label}} n'est pas autorisé",
  'object.min': 'Aucune modification fournie',
};

const username = Joi.string()
  .trim()
  .min(3)
  .max(30)
  .pattern(/^[a-zA-Z0-9_.-]+$/)
  .required()
  .label("Le nom d'utilisateur")
  .messages({ 'string.pattern.base': '{{#label}} ne peut contenir que lettres, chiffres, « . », « _ » et « - »' });

/** Inscription : mot de passe d'au moins 8 caractères avec une lettre et un chiffre. */
const register = Joi.object({
  username,
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/(?=.*[A-Za-z])(?=.*\d)/)
    .required()
    .label('Le mot de passe')
    .messages({ 'string.pattern.base': '{{#label}} doit contenir au moins une lettre et un chiffre' }),
}).messages(messages);

/** Connexion : on ne vérifie que la présence et le type (pas les règles de complexité). */
const login = Joi.object({
  username: Joi.string().trim().max(30).required().label("Le nom d'utilisateur"),
  password: Joi.string().max(128).required().label('Le mot de passe'),
}).messages(messages);

const title = Joi.string().trim().min(1).max(100).custom(noHtml).label('Le titre');
const description = Joi.string().trim().allow('').max(500).custom(noHtml).label('La description');

/** Création d'une tâche. */
const createTask = Joi.object({
  title: title.required(),
  description,
}).messages(messages);

/** Mise à jour partielle d'une tâche : au moins un champ. */
const updateTask = Joi.object({
  title,
  description,
  isCompleted: Joi.boolean().label('Le statut'),
})
  .min(1)
  .messages(messages);

/** Paramètre `:id` : un ObjectId MongoDB valide (évite les CastError => 500). */
const idParam = Joi.object({
  id: Joi.string().hex().length(24).required().label("L'identifiant"),
}).messages({ ...messages, 'string.hex': 'Identifiant invalide', 'string.length': 'Identifiant invalide' });

module.exports = { register, login, createTask, updateTask, idParam };
