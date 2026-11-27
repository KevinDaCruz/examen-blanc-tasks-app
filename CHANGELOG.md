# Journal des évolutions (Changelog)

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) · Versionnage : [SemVer](https://semver.org/lang/fr/).
Chaque correction porte un identifiant (`BUG-xx`, `SEC-xx`) repris dans le code et le rapport.

## [Non publié]

## [2.0.0] - 2026-11-27

Version de maintenance : corrections de bugs (E27), corrections de sécurité (E28), documentation (E29),
conteneurisation, CI/CD, journalisation et supervision (E21 à E26).

### Sécurité (E28)

| ID | Faille | Risque | Correction |
|----|--------|--------|------------|
| SEC-01 | **IDOR** sur `PUT` et `DELETE /api/tasks/:id` : la tâche était cherchée par son seul `_id` | N'importe quel utilisateur connecté pouvait modifier ou supprimer les tâches des autres | Requêtes filtrées par `{ _id, user: req.user.id }` ; une tâche d'autrui renvoie 404 (son existence n'est pas révélée). Tentatives tracées dans le journal d'audit. Tests automatisés ajoutés. |
| SEC-02 | **Secret JWT faible** (`secretkey123`) et `.env` non exclu de Git | Secret devinable, donc tokens falsifiables et usurpation de n'importe quel compte | Secret aléatoire de 256 bits (`openssl rand -hex 32`), `.gitignore`, `.env.example`. Validation au démarrage (Joi) : le serveur refuse de démarrer si le secret manque, fait moins de 32 caractères ou est connu. En production, il est injecté par les variables du serveur et les secrets GitHub. |
| SEC-03 | **CORS ouvert** (`cors()` sans options) | N'importe quel site pouvait appeler l'API depuis le navigateur d'un utilisateur | Liste blanche d'origines (`CORS_ORIGIN`), méthodes limitées. En production, le frontend et l'API partagent la même origine (proxy nginx). |
| SEC-04 | **JWT stocké dans `localStorage`** | Une faille XSS permet de voler le token | Token dans un cookie `HttpOnly`, `SameSite=Strict`, `Secure` en HTTPS, d'une durée de 1 h. Ajout de `GET /api/auth/me` et `POST /api/auth/logout`. |
| SEC-05 | **Aucune validation des entrées** | XSS stocké (`<script>`), injection NoSQL (`{"$ne": null}`), *mass assignment* (champ `user`), données vides ou énormes | Schémas **Joi** sur toutes les routes (types, longueurs, HTML refusé, champs inconnus rejetés), `sanitizeFilter` Mongoose, corps limité à 10 ko, validation des ObjectId. Côté React : rendu texte uniquement (jamais `dangerouslySetInnerHTML`) et CSP stricte dans nginx. |
| SEC-06 | **Pas de protection contre le brute force** | Mots de passe devinables par essais massifs | `express-rate-limit` (10 essais / 15 min / IP) sur login et register, bcrypt à 12 tours, temps de réponse constant (anti-énumération des comptes), mot de passe de 8 caractères minimum avec au moins une lettre et un chiffre. Métrique `auth_login_failures_total` et alerte « BruteForceSuspecte ». |
| SEC-07 | **En-têtes de sécurité absents**, `X-Powered-By: Express` exposé | Clickjacking, *MIME sniffing*, divulgation de la technologie utilisée | `helmet` sur l'API ; CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy` et `Permissions-Policy` dans nginx ; HSTS dans Caddy. |
| SEC-08 | **Dépendances vulnérables** : backend 8 vulnérabilités (2 critiques, 5 hautes), frontend 67 (3 critiques, 40 hautes), `react-scripts` abandonné | Failles connues exploitables (mongoose, express, path-to-regexp, qs…) | Mise à jour : Express 5, Mongoose 9, bcryptjs 3, React 19, React Router 7. Migration de Create React App vers **Vite**. Résultat : **0 vulnérabilité** des deux côtés. `npm audit` bloquant dans la CI. Images Docker : `apk upgrade`, suppression de npm de l'image d'exécution, passage à l'image officielle `nginx:1.30-alpine` (l'image `nginx-unprivileged` avait 57 vulnérabilités, dont des critiques) : **0 vulnérabilité HIGH/CRITICAL** au scan Trivy, qui bloque la CI en cas de faille critique. Rapports avant correction : `docs/audit/`. |
| SEC-09 | **Algorithme JWT non imposé** lors de la vérification | Attaques par confusion d'algorithme | `jwt.verify(..., { algorithms: ['HS256'] })`. |
| SEC-10 | **Fuite d'informations** : erreurs techniques renvoyées au client, hash du mot de passe sélectionnable | Aide à l'attaquant | Gestionnaire d'erreurs centralisé (message générique en production), `select: false` sur le mot de passe et `toJSON` qui le supprime. |
| SEC-11 | **Infrastructure** : MongoDB sans authentification | Base accessible sans identifiants | MongoDB avec authentification et utilisateur applicatif limité à sa base, réseau Docker interne (aucun port publié), conteneurs non-root, `/metrics` non exposé publiquement, pare-feu UFW, fail2ban, SSH par clé uniquement. |

### Corrigé (E27)

| ID | Bug | Correction |
|----|-----|------------|
| BUG-01 | Une tâche ajoutée n'apparaissait qu'après rafraîchissement de la page (`addTask` vide dans `Tasks.js`) | `setTasks(prev => [task, ...prev])`. Toutes les mises à jour d'état utilisent désormais la forme fonctionnelle. |
| BUG-02 | Formulaires vides acceptés : une tâche sans titre provoquait une erreur 500 silencieuse, et l'inscription acceptait un mot de passe d'un seul caractère | Validation côté client (message immédiat) et côté serveur (Joi, réponse 400 avec un message clair). |
| BUG-03 | Aucun retour à l'utilisateur en cas d'erreur (mauvais login, nom déjà pris, serveur injoignable) : seulement un `console.error` | Composant `Alert` accessible (`role="alert"`) affichant le message de l'API ; boutons désactivés pendant l'envoi. |
| BUG-04 | Impossible de modifier ou de terminer une tâche depuis l'interface (la route `PUT` existait mais n'était pas utilisée) | Composant `TaskItem` : case à cocher « terminée », édition en ligne (titre et description), confirmation avant suppression, compteur de tâches restantes. |
| BUG-05 | Plantage possible du serveur : `throw err` dans le callback de `jwt.sign`, hors du `try/catch` | `jwt.sign` synchrone ; Express 5 transmet les erreurs `async` au gestionnaire d'erreurs ; handlers `unhandledRejection` et `uncaughtException` journalisés. |
| BUG-06 | Chargement des tâches sans `try/catch` : promesse rejetée non gérée et page vide si le token expirait | Gestion d'erreur, indicateur de chargement, message d'état vide ; déconnexion automatique sur 401 (intercepteur axios). |
| BUG-07 | Token invalide : réponse **418** « I'm a teapot » au lieu de **401** | 401 avec un message explicite. |
| BUG-08 | Après déconnexion, l'utilisateur restait sur la page des tâches ; le lien « Mes Tâches » était visible pour un visiteur ; pas de lien d'inscription | Redirection vers `/login`, navigation adaptée à l'état de connexion, nom de l'utilisateur affiché. |
| BUG-09 | Route `/tasks` non protégée ; l'état « connecté » reposait sur la seule présence d'un token, même expiré | `ProtectedRoute` / `PublicOnlyRoute` et vérification de la session via `/api/auth/me`. |
| BUG-10 | Après l'inscription, le token renvoyé était ignoré et l'utilisateur était envoyé au login sans message | Connexion automatique après inscription, champ de confirmation du mot de passe. |
| BUG-11 | Mise en page : `<header>` imbriqué dans un autre `<header>`, règles CSS `header` dupliquées et contradictoires, `width: 100vw` provoquant un défilement horizontal, `display:flex` et `padding` sur `<body>`, style inline dans le footer, année codée en dur | CSS réécrit avec des variables et une mise en page responsive ; année dynamique. |
| BUG-12 | `PUT` sans `runValidators` (titre vide possible) ; identifiant invalide renvoyant une erreur 500 (CastError) ; JSON malformé renvoyant une page HTML 500 | Validation Joi des paramètres et du corps ; erreurs 400 en JSON. |
| BUG-13 | `findByIdAndRemove` (retiré de Mongoose 8+) et options `useNewUrlParser` / `useUnifiedTopology` obsolètes | `findOneAndDelete` ; options supprimées. |
| BUG-14 | Le serveur acceptait des requêtes avant que MongoDB soit connecté ; pas d'arrêt propre | `listen` après la connexion, arrêt propre sur SIGTERM/SIGINT (redéploiements Docker). |
| BUG-15 | URL de l'API codée en dur (`http://localhost:5000/api`), donc inutilisable une fois déployée | `VITE_API_URL`, par défaut `/api` (même origine, proxy Vite en dev et nginx en prod). |
| BUG-16 | Interface mêlant anglais et français | Interface entièrement en français, libellés de formulaires associés (`htmlFor`), attributs `autocomplete`. |

### Ajouté

- **Tests automatisés** : 26 tests d'API (`node:test` + supertest : authentification, IDOR, XSS, injection NoSQL, validation, en-têtes) et 8 tests React (Vitest + Testing Library).
- **Qualité** : ESLint et Prettier dans les deux projets, vérifiés par la CI.
- **Documentation (E29)** : JSDoc sur tout le backend (routes, middlewares, modèles) et sur les composants React. Génération HTML avec `npm run docs`, vers `docs/api-backend/` et `docs/frontend/`.
- **Journalisation (E25)** : Winston (JSON en production, console lisible en dev), logs d'accès HTTP morgan, fichiers `error.log`, `combined.log` et `audit.log` avec rotation, journal d'audit sécurité (inscriptions, connexions, échecs, accès refusés, CORS rejetés), module `debug` pour le développement.
- **Supervision (E26)** : `GET /api/health` (état de l'API et de MongoDB) et `GET /metrics` (Prometheus). Pile Prometheus, Alertmanager (notifications push **ntfy**, faute de serveur SMTP fourni), Blackbox, node-exporter et Grafana avec tableau de bord. 9 alertes : site inaccessible, API down, latence p95 > 500 ms, erreurs 5xx > 5 %, mémoire, brute force, certificat TLS, disque, CPU.
- **Conteneurisation (E24)** : Dockerfiles (image backend non-root avec healthcheck ; frontend multi-stage servi par nginx non-root), `docker-compose.yml` (MongoDB authentifié, réseau interne, volumes, rotation des logs), `deploy.sh` (healthchecks, test de fumée, rollback automatique).
- **CI/CD (E24)** : GitHub Actions (lint, tests, audit, build et push des images sur GHCR, scan Trivy, déploiement automatique en pré-production sur `develop` et en production sur `main` avec approbation manuelle).
- **Hébergement gratuit Render + MongoDB Atlas** : Blueprint `render.yaml` (infrastructure as code des 2 environnements), déploiement par l'API Render depuis GitHub Actions (commit testé, approbation pour la prod), `/metrics` protégé par jeton (`METRICS_TOKEN`).
- **Base de données au choix** : MongoDB Atlas (service managé, `MONGO_URI`) ou conteneur MongoDB (profil Compose `local-db`), selon l'environnement.
- **Hébergement (E21 à E23)** : reverse-proxy Caddy (HTTPS Let's Encrypt automatique, HSTS, pré-production protégée par mot de passe et non indexée), script de durcissement du VPS, sauvegardes MongoDB.

### Modifié

- Backend : Express 4 → 5, Mongoose 7 → 9, bcryptjs 2 → 3, dotenv 16 → 18. Séparation `app.js` / `server.js`.
- Frontend : Create React App → Vite 8, React 18 → 19, React Router 6 → 7, contexte d'authentification (Context API).

### Supprimé

- `react-scripts` (Create React App, abandonné) et le stockage du token dans `localStorage`.

## [1.0.0] - 2025-11-24

- Version initiale fournie pour l'examen (application de gestion de tâches React / Express / MongoDB).

[Non publié]: https://github.com/KevinDaCruz/examen-blanc-tasks-app/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/KevinDaCruz/examen-blanc-tasks-app/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/KevinDaCruz/examen-blanc-tasks-app/releases/tag/v1.0.0
