/**
 * @file Modèle Mongoose d'une tâche.
 * @module models/Task
 */
const mongoose = require('mongoose');

/**
 * @typedef {object} Task
 * @property {mongoose.Types.ObjectId} user - Propriétaire de la tâche (utilisé pour le contrôle d'accès).
 * @property {string} title - Titre obligatoire (1 à 100 caractères).
 * @property {string} [description] - Description optionnelle (500 caractères max).
 * @property {boolean} isCompleted - Statut de la tâche.
 * @property {Date} createdAt
 * @property {Date} updatedAt
 */
const TaskSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, versionKey: false },
);

module.exports = mongoose.model('Task', TaskSchema);
