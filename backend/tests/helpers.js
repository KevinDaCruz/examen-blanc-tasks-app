// Configuration de l'environnement de test AVANT le chargement de l'application.
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/tasks_test';
process.env.JWT_SECRET = process.env.JWT_SECRET_TEST || 'test-secret-0123456789abcdef0123456789abcdef';

const mongoose = require('mongoose');
const request = require('supertest');
const { connectDB } = require('../config/db');
const app = require('../app');

/** Connecte la base de test et la vide. */
async function setupDb() {
  await connectDB(process.env.MONGO_URI);
  await mongoose.connection.dropDatabase();
}

async function teardownDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
}

/**
 * Crée un utilisateur et renvoie un agent supertest qui conserve le cookie de session.
 * @param {string} username
 */
async function registeredAgent(username, password = 'Password123') {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ username, password }).expect(201);
  return agent;
}

module.exports = { app, request, setupDb, teardownDb, registeredAgent };
