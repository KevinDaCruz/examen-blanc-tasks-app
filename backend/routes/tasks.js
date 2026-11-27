/**
 * @file Routes CRUD des tâches de l'utilisateur connecté.
 *
 * Toutes les routes exigent une session valide (middleware `auth`).
 * Contrôle d'accès (correction IDOR) : chaque requête filtre sur
 * `{ _id, user: req.user.id }`. Une tâche appartenant à un autre utilisateur
 * est donc traitée exactement comme une tâche inexistante (404), sans révéler
 * son existence.
 * @module routes/tasks
 */
const express = require('express');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const schemas = require('../validators/schemas');
const Task = require('../models/Task');
const logger = require('../config/logger');

const router = express.Router();

router.use(auth);

/**
 * Liste les tâches de l'utilisateur connecté, les plus récentes en premier.
 *
 * @name GET /api/tasks
 * @route {GET} /api/tasks
 * @authentication Cookie `token` requis.
 * @returns {200} `Task[]`
 * @returns {401} Non authentifié.
 */
router.get('/', async (req, res) => {
  const tasks = await Task.find({ user: req.user.id }).sort({ createdAt: -1 });
  res.json(tasks);
});

/**
 * Crée une tâche pour l'utilisateur connecté.
 *
 * @name POST /api/tasks
 * @route {POST} /api/tasks
 * @authentication Cookie `token` requis.
 * @bodyparam {string} title - Obligatoire, 1 à 100 caractères, sans HTML.
 * @bodyparam {string} [description] - 500 caractères max., sans HTML.
 * @returns {201} La tâche créée.
 * @returns {400} Titre vide, trop long, ou contenant du HTML (ex: `<script>`).
 * @returns {401} Non authentifié.
 * @example
 * // Requête
 * POST /api/tasks  { "title": "Réviser l'examen", "description": "Chapitres E21 à E29" }
 * // Réponse 201
 * { "_id": "665f…", "title": "Réviser l'examen", "description": "Chapitres E21 à E29",
 *   "isCompleted": false, "user": "665e…", "createdAt": "…", "updatedAt": "…" }
 */
router.post('/', validate(schemas.createTask), async (req, res) => {
  const task = await Task.create({ ...req.body, user: req.user.id });
  res.status(201).json(task);
});

/**
 * Met à jour (partiellement) une tâche appartenant à l'utilisateur connecté.
 *
 * @name PUT /api/tasks/:id
 * @route {PUT} /api/tasks/:id
 * @authentication Cookie `token` requis.
 * @routeparam {string} id - ObjectId de la tâche.
 * @bodyparam {string} [title]
 * @bodyparam {string} [description]
 * @bodyparam {boolean} [isCompleted]
 * @returns {200} La tâche mise à jour.
 * @returns {400} Identifiant ou données invalides.
 * @returns {404} Tâche inexistante OU appartenant à un autre utilisateur.
 */
router.put('/:id', validate(schemas.idParam, 'params'), validate(schemas.updateTask), async (req, res) => {
  const task = await Task.findOneAndUpdate(
    { _id: req.validatedParams.id, user: req.user.id },
    { $set: req.body },
    { returnDocument: 'after', runValidators: true },
  );

  if (!task) {
    logger.audit('tasks.update_denied_or_missing', { userId: req.user.id, taskId: req.validatedParams.id });
    return res.status(404).json({ msg: 'Tâche introuvable' });
  }
  return res.json(task);
});

/**
 * Supprime une tâche appartenant à l'utilisateur connecté.
 * (`findByIdAndRemove` a été retiré de Mongoose 8+ : remplacé par `findOneAndDelete`.)
 *
 * @name DELETE /api/tasks/:id
 * @route {DELETE} /api/tasks/:id
 * @authentication Cookie `token` requis.
 * @routeparam {string} id - ObjectId de la tâche.
 * @returns {200} `{ msg: 'Tâche supprimée', id }`
 * @returns {400} Identifiant invalide.
 * @returns {404} Tâche inexistante OU appartenant à un autre utilisateur.
 */
router.delete('/:id', validate(schemas.idParam, 'params'), async (req, res) => {
  const task = await Task.findOneAndDelete({ _id: req.validatedParams.id, user: req.user.id });

  if (!task) {
    logger.audit('tasks.delete_denied_or_missing', { userId: req.user.id, taskId: req.validatedParams.id });
    return res.status(404).json({ msg: 'Tâche introuvable' });
  }
  return res.json({ msg: 'Tâche supprimée', id: task.id });
});

module.exports = router;
