const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.RATE_LIMIT_IN_TEST = '1';
process.env.TRUST_PROXY = '1';
const { app, request, setupDb, teardownDb } = require('./helpers');

before(setupDb);
after(teardownDb);

describe('Anti brute-force', () => {
  it('bloque un compte après 10 échecs, même si l’IP change à chaque essai (X-Forwarded-For falsifié)', async () => {
    await request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-For', '10.0.0.1')
      .send({ username: 'victime', password: 'Password123' })
      .expect(201);
    for (let i = 0; i < 10; i += 1) {
      await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', `203.0.113.${i + 1}`)
        .send({ username: 'victime', password: `mauvais${i}` })
        .expect(401);
    }
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.99')
      .send({ username: 'victime', password: 'Password123' })
      .expect(429);
    assert.match(res.body.msg, /ce compte/);
  });

  it('limite aussi par IP (10 requêtes / 15 min)', async () => {
    for (let i = 0; i < 10; i += 1) {
      await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '198.51.100.7')
        .send({ username: `u${i}`, password: 'x' });
    }
    await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '198.51.100.7')
      .send({ username: 'autre', password: 'x' })
      .expect(429);
  });
});
