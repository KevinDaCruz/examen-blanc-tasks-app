# Mes Tâches : application de gestion de tâches

Application « To-Do List » : frontend **React 19 (Vite)**, API **Node.js / Express 5**, base **MongoDB**.
Ce dépôt contient la version **2.0.0**, corrigée et prête pour la production. La version initiale comportait volontairement des bugs et des failles de sécurité.

- Énoncé de l'exercice : [docs/CONSIGNES.md](docs/CONSIGNES.md)
- Corrections apportées (bugs, failles) : [CHANGELOG.md](CHANGELOG.md)
- Architecture, hébergement, CI/CD, logs, supervision : [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md)
- Documentation générée depuis le code : [docs/api-backend/index.html](docs/api-backend/index.html) et [docs/frontend/index.html](docs/frontend/index.html)

## Architecture

```
Navigateur ──HTTPS──► Caddy (TLS Let's Encrypt)
                        ├── app.<domaine>      ──► frontend-prod    (nginx : fichiers React + proxy /api) ──► backend-prod    ──► mongo-prod
                        ├── preprod.<domaine>  ──► frontend-preprod (idem, protégé par mot de passe)      ──► backend-preprod ──► mongo-preprod
                        └── monitoring.<domaine> ► Grafana ◄── Prometheus ◄── /metrics, Blackbox, node-exporter ──► Alertmanager (e-mail)
```

## Démarrage en développement

Prérequis : Node.js 22 ou plus récent, et MongoDB en local (ou `docker run -d -p 27017:27017 mongo:8`).

```bash
# Backend
cd backend
cp .env.example .env              # puis renseigner JWT_SECRET : openssl rand -hex 32
npm install
npm run dev                       # http://localhost:5000  (rechargement automatique + logs debug)

# Frontend (autre terminal)
cd frontend
npm install
npm run dev                       # http://localhost:3000  (/api est proxifié vers :5000)
```

## Démarrage avec Docker (comme en production)

```bash
cp .env.example .env.local        # remplir les secrets ; ENV_NAME=local, PUBLIC_URL=http://localhost:8080, COOKIE_SECURE=false
./deploy.sh local                 # build des images, puis MongoDB + API + nginx → http://localhost:8080
```

## Scripts utiles

| Commande | Backend | Frontend |
|----------|---------|----------|
| `npm test` | 26 tests d'API (MongoDB requis) | 8 tests de composants |
| `npm run lint` | ESLint | ESLint |
| `npm run format` | Prettier | Prettier |
| `npm run docs` | JSDoc → `docs/api-backend/` | JSDoc → `docs/frontend/` |
| `npm audit` | 0 vulnérabilité | 0 vulnérabilité |

## API

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/api/health` | – | État de l'API et de MongoDB (200 / 503) |
| POST | `/api/auth/register` | – | Inscription et ouverture de session (cookie HttpOnly) |
| POST | `/api/auth/login` | – | Connexion (limitée à 10 essais / 15 min) |
| POST | `/api/auth/logout` | – | Déconnexion |
| GET | `/api/auth/me` | cookie | Utilisateur connecté |
| GET | `/api/tasks` | cookie | Liste des tâches de l'utilisateur |
| POST | `/api/tasks` | cookie | Création (`title` obligatoire, `description` facultative) |
| PUT | `/api/tasks/:id` | cookie | Modification (`title`, `description`, `isCompleted`) |
| DELETE | `/api/tasks/:id` | cookie | Suppression |
| GET | `/metrics` | réseau interne | Métriques Prometheus (non exposées publiquement) |

## Structure

```
backend/         API Express : config/ (env, logger, db), middleware/, models/, routes/, validators/, tests/
frontend/        React + Vite : src/components, src/pages, src/context, nginx/ (config du conteneur)
docker/          Script d'initialisation de MongoDB (utilisateur applicatif)
infra/proxy/     Caddy : HTTPS et reverse-proxy des deux environnements
infra/monitoring/ Prometheus, Alertmanager, Blackbox, Grafana (règles d'alerte, tableau de bord)
infra/scripts/   Durcissement du serveur, sauvegardes MongoDB
.github/workflows/ Pipeline CI/CD
docs/            Consignes, guide de déploiement, audits npm « avant », documentation générée
```
