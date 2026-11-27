/**
 * @file Modèle Mongoose d'un utilisateur.
 * @module models/User
 */
const mongoose = require('mongoose');

/**
 * @typedef {object} User
 * @property {string} username - Identifiant unique (3 à 30 caractères).
 * @property {string} password - Hash bcrypt du mot de passe (jamais le mot de passe en clair).
 * @property {Date} createdAt
 * @property {Date} updatedAt
 */
const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    password: {
      type: String,
      required: true,
      // Le hash n'est jamais renvoyé par défaut dans les requêtes.
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  },
);

module.exports = mongoose.model('User', UserSchema);
