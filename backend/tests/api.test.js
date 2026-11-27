const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, setupDb, teardownDb, registeredAgent } = require('./helpers');

before(setupDb);
after(teardownDb);

describe('Santé et configuration', () => {
  it('GET /api/health répond ok quand la base est connectée', async () => {
    const res = await request(app).get('/api/health').expect(200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.db, 'up');
  });

  it('envoie les en-têtes de sécurité et masque X-Powered-By', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.headers['x-powered-by'], undefined);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });

  it("refuse l'origine CORS non autorisée", async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://site-malveillant.com');
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });

  it('expose les métriques Prometheus', async () => {
    const res = await request(app).get('/metrics').expect(200);
    assert.match(res.text, /http_request_duration_seconds/);
  });

  it('renvoie 404 JSON sur une route inconnue', async () => {
    const res = await request(app).get('/api/inexistant').expect(404);
    assert.ok(res.body.msg);
  });
});

describe('Authentification', () => {
  it("refuse l'inscription avec des champs vides", async () => {
    const res = await request(app).post('/api/auth/register').send({ username: '', password: '' }).expect(400);
    assert.match(res.body.msg, /obligatoire/);
  });

  it('refuse un mot de passe trop faible', async () => {
    const res = await request(app).post('/api/auth/register').send({ username: 'faible', password: '123' }).expect(400);
    assert.match(res.body.msg, /au moins 8/);
  });

  it('inscrit un utilisateur, pose un cookie HttpOnly et ne renvoie pas le hash', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'alice', password: 'Password123' })
      .expect(201);
    const cookie = res.headers['set-cookie'][0];
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.equal(res.body.user.username, 'alice');
    assert.equal(res.body.user.password, undefined);
    assert.equal(res.body.token, undefined, 'le token ne doit plus être exposé au JavaScript');
  });

  it('refuse un doublon de nom d’utilisateur (409)', async () => {
    await request(app).post('/api/auth/register').send({ username: 'alice', password: 'Password123' }).expect(409);
  });

  it('renvoie un message explicite sur mauvais mot de passe (401)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'mauvais1' })
      .expect(401);
    assert.match(res.body.msg, /incorrect/);
  });

  it("bloque l'injection NoSQL dans le login", async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ username: { $ne: null }, password: { $ne: null } })
      .expect(400);
  });

  it('GET /api/auth/me renvoie 401 sans session (et non plus 418)', async () => {
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/auth/me').set('Cookie', 'token=faux.jeton.jwt').expect(401);
  });

  it('login puis /me puis logout', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'alice', password: 'Password123' }).expect(200);
    const me = await agent.get('/api/auth/me').expect(200);
    assert.equal(me.body.user.username, 'alice');
    await agent.post('/api/auth/logout').expect(200);
    await agent.get('/api/auth/me').expect(401);
  });

  it('renvoie 400 (et pas 500) sur un JSON malformé', async () => {
    await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username": ')
      .expect(400);
  });
});

describe('Tâches', () => {
  let bob;
  let eve;
  let bobTaskId;

  before(async () => {
    bob = await registeredAgent('bob');
    eve = await registeredAgent('eve');
  });

  it('exige une authentification', async () => {
    await request(app).get('/api/tasks').expect(401);
  });

  it('refuse un titre vide', async () => {
    const res = await bob.post('/api/tasks').send({ title: '   ' }).expect(400);
    assert.match(res.body.msg, /titre/i);
  });

  it('refuse le HTML / JavaScript (XSS)', async () => {
    const res = await bob.post('/api/tasks').send({ title: "<script>alert('test')</script>" }).expect(400);
    assert.match(res.body.msg, /HTML/);
    await bob.post('/api/tasks').send({ title: 'ok', description: '<img src=x onerror=alert(1)>' }).expect(400);
  });

  it("refuse l'affectation du champ user (mass assignment)", async () => {
    await bob.post('/api/tasks').send({ title: 'pirate', user: '000000000000000000000000' }).expect(400);
  });

  it('crée puis liste une tâche', async () => {
    const res = await bob.post('/api/tasks').send({ title: '  Réviser E28  ', description: 'IDOR' }).expect(201);
    bobTaskId = res.body._id;
    assert.equal(res.body.title, 'Réviser E28');
    const list = await bob.get('/api/tasks').expect(200);
    assert.equal(list.body.length, 1);
  });

  it("n'affiche pas les tâches d'un autre utilisateur", async () => {
    const list = await eve.get('/api/tasks').expect(200);
    assert.equal(list.body.length, 0);
  });

  it('IDOR : eve ne peut PAS modifier la tâche de bob', async () => {
    await eve.put(`/api/tasks/${bobTaskId}`).send({ title: 'piraté' }).expect(404);
  });

  it('IDOR : eve ne peut PAS supprimer la tâche de bob', async () => {
    await eve.delete(`/api/tasks/${bobTaskId}`).expect(404);
    const list = await bob.get('/api/tasks').expect(200);
    assert.equal(list.body[0].title, 'Réviser E28');
  });

  it('bob peut terminer et renommer sa tâche', async () => {
    const res = await bob.put(`/api/tasks/${bobTaskId}`).send({ isCompleted: true, title: 'Fait' }).expect(200);
    assert.equal(res.body.isCompleted, true);
    assert.equal(res.body.title, 'Fait');
  });

  it('refuse une mise à jour vide ou un titre vide', async () => {
    await bob.put(`/api/tasks/${bobTaskId}`).send({}).expect(400);
    await bob.put(`/api/tasks/${bobTaskId}`).send({ title: '' }).expect(400);
  });

  it('renvoie 400 (et pas 500) sur un identifiant invalide', async () => {
    await bob.put('/api/tasks/abc').send({ title: 'x' }).expect(400);
    await bob.delete('/api/tasks/abc').expect(400);
  });

  it('bob peut supprimer sa tâche', async () => {
    await bob.delete(`/api/tasks/${bobTaskId}`).expect(200);
    await bob.delete(`/api/tasks/${bobTaskId}`).expect(404);
  });
});
