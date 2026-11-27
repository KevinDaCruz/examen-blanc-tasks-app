const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

// Jeton défini AVANT le chargement de la configuration.
process.env.METRICS_TOKEN = 'jeton-metrics-de-test-0123456789';
const { app, request, setupDb, teardownDb } = require('./helpers');

before(setupDb);
after(teardownDb);

describe('Protection de /metrics par jeton', () => {
  it('refuse sans jeton ou avec un mauvais jeton (401)', async () => {
    await request(app).get('/metrics').expect(401);
    await request(app).get('/metrics').set('Authorization', 'Bearer mauvais-jeton-0123456789').expect(401);
  });

  it('accepte le bon jeton', async () => {
    const res = await request(app)
      .get('/metrics')
      .set('Authorization', `Bearer ${process.env.METRICS_TOKEN}`)
      .expect(200);
    assert.match(res.text, /http_requests_total/);
  });
});
