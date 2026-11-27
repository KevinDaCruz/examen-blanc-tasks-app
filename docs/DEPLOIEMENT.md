# Mise en production : hébergement, CI/CD, journalisation, supervision

Ce guide couvre les compétences E21 à E26. Les corrections de code (E27 à E29) sont décrites dans le [CHANGELOG](../CHANGELOG.md).

## 0. Solution déployée (résumé)

| | Pré-production | Production |
|---|---|---|
| URL | https://preprod.kevin-tasks.duckdns.org | https://kevin-tasks.duckdns.org |
| Branche Git / déploiement | `develop` : automatique après la CI | `main` : après la CI **et** approbation manuelle |
| Frontend (Render, site statique) | `kdc-tasks-web-preprod` | `kdc-tasks-web-prod` |
| API (Render, Docker, Frankfurt) | `kdc-tasks-api-preprod` | `kdc-tasks-api-prod` |
| Base (MongoDB Atlas M0, AWS Frankfurt) | base `tasks_preprod`, utilisateur `tasks_preprod` | base `tasks_prod`, utilisateur `tasks_prod` |
| Supervision (Grafana Cloud) | job `tasks-api-preprod` + sonde `site-preprod` | job `tasks-api-prod` + sonde `site-prod` |

Coût total : **0 €**. Toute la configuration est versionnée :
- `render.yaml` : Blueprint Render ;
- `.github/workflows/` : pipeline CI/CD ;
- `infra/grafana-cloud/provision.py` : alertes, tableau de bord et notifications.

La variante **VPS + Docker Compose** (sections 2 à 8) reste prête à l'emploi : même code, même images.

---

## 1. Choix de l'hébergement (E21)

L'application est composée de trois services légers (frontend statique, API Node.js, MongoDB), conteneurisés, et doit fonctionner dans **deux environnements** (pré-production et production). La contrainte du projet est un **budget nul**.

**Choix retenu : PaaS Render, MongoDB Atlas et Grafana Cloud** (offres gratuites, sans carte bancaire). C'est aussi la solution suggérée par les consignes : « Render… avec MongoDB Atlas et HTTPS ».

| Critère | VPS + Docker (variante prête) | PaaS Render + MongoDB Atlas (**retenu**) | Kubernetes managé (GKE, AKS, Kapsule) |
|---------|-----------------------|----------------------------------------|----------------------------------------|
| Coût | 4 à 6 €/mois pour les 2 environnements | Gratuit mais limité (mise en veille), puis environ 7 $/service/mois | Plus de 50 €/mois |
| Performance | Ressources dédiées, pas de démarrage à froid | Démarrage à froid de 30 à 60 s en offre gratuite | Très bonne, mais surdimensionnée ici |
| Maîtrise et sécurité | Contrôle complet : pare-feu, SSH, réseau Docker, versions | Dépend du fournisseur ; base hébergée ailleurs | Complexe à sécuriser |
| Maintenance | Mises à jour système à gérer (automatisées par `unattended-upgrades`) | Minimale | Élevée |
| Supervision | Prometheus, Grafana et alertes libres | Limitée aux outils du fournisseur | Complète |
| Données (RGPD) | Datacenter choisi (France ou UE) | Souvent aux États-Unis par défaut | Au choix |
| Portabilité | Même `docker-compose.yml` partout | Configuration propre au fournisseur | Manifests Kubernetes |

**Fournisseurs envisagés** (Ubuntu 24.04, 2 vCPU, 2 à 4 Go de RAM, environ 40 Go de disque) : Hetzner Cloud CX22 (UE), Scaleway (France), OVHcloud VPS (France), ou DigitalOcean (crédit offert par le GitHub Student Pack).

**Pourquoi Render l'emporte ici** : avec un budget nul, Render fournit gratuitement l'hébergement Docker, les sites statiques sur CDN, le HTTPS automatique avec renouvellement, les domaines personnalisés, les logs, les déploiements par API et le Blueprint (infrastructure as code). On accepte en contrepartie :
- **la mise en veille** de l'API après 15 minutes sans trafic, avec environ 1 minute de réveil. Les sondes de supervision la maintiennent éveillée pendant la période d'évaluation ;
- **le quota de 750 h/mois** d'instance gratuite, partagé entre les services du compte ;
- **l'absence d'IP de sortie fixe**, qui oblige à ouvrir Atlas à `0.0.0.0/0`. C'est compensé par des mots de passe forts, TLS obligatoire, et un utilisateur par environnement limité à sa base.

**Recommandation pour une variante VPS, alignée sur les consignes** (AWS, GCP, Render ou Scaleway, avec MongoDB Atlas et Let's Encrypt) :

- **Scaleway** : instance DEV1-S ou PLAY2 à Paris (PAR1). Fournisseur français, données hébergées en France (RGPD), facturation à l'heure, console simple, IPv4 publique incluse.
- **MongoDB Atlas** pour la base, avec deux bases séparées (pré-production et production) sur un cluster M0 gratuit, hébergé chez AWS à Paris (`eu-west-3`). C'est un service managé : haute disponibilité (replica set de 3 nœuds), chiffrement au repos et en transit (TLS), liste blanche d'IP (seule l'IP du VPS est autorisée), et utilisateurs à droits limités (`readWrite` sur une seule base).
- **Let's Encrypt** via Caddy, pour les certificats HTTPS automatiques.

Le `docker-compose.yml` accepte les **deux modes de base de données**. Avec `MONGO_URI=mongodb+srv://…` dans le `.env` de l'environnement, l'API utilise Atlas. Si la variable est vide, `deploy.sh` démarre un conteneur MongoDB authentifié (profil `local-db`), ce qui sert pour le développement ou comme solution de repli.

> Fournisseur retenu : **_à compléter_** · Datacenter : **_à compléter_** · IP publique : **_à compléter_** · Base : **_Atlas / conteneur_**

### Mise en place de MongoDB Atlas (si retenu)

1. Sur <https://cloud.mongodb.com>, créer un cluster **M0 (Free)**, fournisseur AWS, région **Paris (eu-west-3)**.
2. Dans *Database Access*, créer deux utilisateurs avec un mot de passe fort et le rôle **readWrite** limité à une seule base :
   - `tasks_preprod`, sur la base `tasks_preprod` ;
   - `tasks_prod`, sur la base `tasks_prod`.
3. Dans *Network Access*, n'autoriser **que l'IP publique du VPS**, jamais `0.0.0.0/0`.
4. Dans *Connect → Drivers*, copier la chaîne de connexion et la placer dans chaque fichier d'environnement :
   - `.env.preprod` : `MONGO_URI=mongodb+srv://tasks_preprod:<mdp>@<cluster>.mongodb.net/tasks_preprod?retryWrites=true&w=majority`
   - `.env.prod` : `MONGO_URI=mongodb+srv://tasks_prod:<mdp>@<cluster>.mongodb.net/tasks_prod?retryWrites=true&w=majority`
5. Supervision : l'onglet *Metrics* d'Atlas complète Prometheus (connexions, opérations par seconde, stockage), et on peut y configurer des alertes Atlas. Sauvegardes : l'offre M0 n'en fait pas automatiquement, donc on planifie un `mongodump` avec l'URI Atlas.

---

## 1 bis. Architecture déployée (Render + Atlas)

```
 DuckDNS (DNS)  kevin-tasks.duckdns.org (A 216.24.57.1)  ·  preprod.kevin-tasks.duckdns.org
                         │ HTTPS (certificats automatiques, renouvelés par Render)
        ┌────────────────▼───────────────┐        ┌────────────────────────────────┐
        │ Site statique React (CDN)      │ /api/* │ API Express (Docker, Frankfurt)│
        │ CSP, HSTS, X-Frame-Options     ├───────►│ /api/health · /metrics (jeton) │
        │ rewrite /api/* -> API (proxy)  │        └───────────────┬────────────────┘
        └────────────────────────────────┘                        │ TLS, utilisateur dédié
                                                   ┌──────────────▼─────────────────┐
  Grafana Cloud : scrape /metrics (1 min)          │ MongoDB Atlas M0 (AWS Frankfurt)│
  + sondes HTTPS (2 sondes UE, 5 min)               │ tasks_preprod  |  tasks_prod    │
  -> 7 alertes -> ntfy (push mobile)                └────────────────────────────────┘
```

- **Même origine** : le site relaie `/api/*` vers l'API. Le navigateur ne parle qu'à `kevin-tasks.duckdns.org`, et le cookie de session reste `HttpOnly; Secure; SameSite=Strict`.
- **IP réelle du client** : la chaîne de proxys a été mesurée (site → edge Render → API = 6 sauts), d'où `TRUST_PROXY=6`. Une limite par compte complète la limite par IP, car un appel direct à l'API avec un `X-Forwarded-For` falsifié pourrait sinon contourner cette dernière.
- **Certificats** : émis par Render (autorité *Google Trust Services* pour ces domaines ; Render utilise aussi Let's Encrypt) et renouvelés automatiquement. Ils ont été vérifiés avec `openssl s_client` : sujet = domaine, validité de 90 jours.
- **Secrets** : `JWT_SECRET` et `METRICS_TOKEN` sont générés par Render (256 bits), `MONGO_URI` est saisi dans Render, `RENDER_API_KEY` est dans les secrets GitHub. Aucun secret n'est dans Git (vérifié avec gitleaks sur tout l'historique).

**Journalisation (E25) sur Render** : les logs JSON de Winston (accès HTTP, erreurs, événements `AUDIT`) sont collectés par Render. On les consulte dans *Dashboard → service → Logs* (filtre `AUDIT`, `auth.login_failed`…) ou par l'API `GET /v1/logs`. Les déploiements sont tracés dans l'onglet *Events* de Render et dans l'historique GitHub Actions. Atlas fournit en plus ses propres métriques et l'historique des connexions.

**Supervision (E26) sur Grafana Cloud** :
- un *Metrics Endpoint* collecte `/metrics` sur les deux API (Bearer `METRICS_TOKEN`) ;
- *Synthetic Monitoring* sonde `https://…/api/health` depuis 2 sondes européennes toutes les 5 minutes : statut 200, corps `"status":"ok"`, TLS obligatoire et date d'expiration du certificat ;
- le tableau de bord « Application Mes Tâches » et 7 alertes sont créés par `infra/grafana-cloud/provision.py` :

| Alerte | Condition | Gravité |
|---|---|---|
| SiteInaccessible | moins de 50 % des sondes HTTPS OK pendant 3 min | critique |
| ApiDown | collecte `/metrics` en échec pendant 5 min | critique |
| TauxErreurs5xx | plus de 5 % de réponses 5xx sur 5 min | critique |
| LatenceElevee | latence p95 > 500 ms sur 5 min | avertissement |
| MemoireApiElevee | plus de 400 Mo de RSS (instance de 512 Mo) | avertissement |
| BruteForceSuspecte | plus de 20 échecs de connexion en 5 min | avertissement |
| CertificatExpireBientot | certificat expirant dans moins de 14 jours | avertissement |

Les notifications sont envoyées en push via **ntfy**, faute de SMTP fourni. Les alertes critiques de production sont répétées toutes les 30 minutes. La chaîne Grafana → ntfy a été testée de bout en bout.

**Après l'examen** : désactiver les sondes et les jobs de collecte (sinon l'API ne se met jamais en veille et consomme le quota de 750 h), et révoquer les jetons d'API Render et Grafana.

---

## 2. Architecture cible (variante VPS)

```
                    DNS : app / preprod / monitoring.<domaine>  ─►  IP du VPS
                                         │
                         ┌───────────────▼────────────────┐   UFW : seuls 22, 80, 443 ouverts
                         │ Caddy :80 :443 (Let's Encrypt) │   fail2ban, SSH par clé uniquement
                         └──┬──────────────┬───────────┬──┘
           tasks-prod-net   │              │           │ monitoring-net
          ┌─────────────────▼─┐  ┌─────────▼─────────┐ ┌▼──────────────────────────────┐
          │ frontend-prod     │  │ frontend-preprod  │ │ Grafana ◄─ Prometheus ─► Alert │
          │ nginx (non-root)  │  │ (mot de passe)    │ │   manager ──► ntfy (push)      │
          │   │ /api          │  │   │ /api          │ │ Blackbox (sondes HTTPS + TLS)  │
          │ backend-prod      │  │ backend-preprod   │ │ node-exporter (serveur)        │
          │   │ réseau interne│  │   │               │ └────────────────────────────────┘
          │ mongo-prod (auth) │  │ mongo-preprod     │
          └───────────────────┘  └───────────────────┘
```

- Chaque environnement est un projet Docker Compose isolé (`tasks-prod`, `tasks-preprod`) avec sa propre base, ses propres secrets et son propre réseau.
- MongoDB est sur un réseau Docker `internal` : il n'a ni accès Internet ni port publié. Avec Atlas, les conteneurs `mongo-*` disparaissent et l'API se connecte en TLS au cluster managé, qui n'autorise que l'IP du VPS.
- Le frontend (nginx) sert le build React et relaie `/api` vers l'API, ce qui permet d'avoir une seule origine : cookie `SameSite=Strict` et pas de CORS cross-site.

---

## 3. Préparation et sécurisation du serveur (E22) - variante VPS

```bash
# Depuis votre poste : copier le script, puis l'exécuter en root sur le VPS
scp infra/scripts/server-setup.sh root@<IP>:/root/
ssh root@<IP> 'bash /root/server-setup.sh'
# Vérifier AVANT de fermer la session root :
ssh deploy@<IP> 'docker ps'
```

Ce que fait le script :

| Mesure | Détail |
|--------|--------|
| Mises à jour | `apt upgrade` et `unattended-upgrades` (correctifs de sécurité automatiques) |
| Utilisateur dédié | `deploy` (pas de mot de passe, clé SSH), membre du groupe `docker` |
| SSH | `PermitRootLogin no`, `PasswordAuthentication no`, `MaxAuthTries 3` |
| Pare-feu | UFW : refus par défaut, ouverture de 22, 80 et 443 uniquement |
| Anti brute force | fail2ban (jail sshd) |
| Docker | Rotation des logs (10 Mo × 5), `live-restore`, réseaux partagés créés |

Mesures complémentaires dans l'application : conteneurs non-root, MongoDB authentifié avec un utilisateur limité (`readWrite` sur sa base seulement), secrets uniquement dans des fichiers `.env.*` sur le serveur (`chmod 600`, jamais dans Git), pré-production protégée par mot de passe et non indexée.

Configuration des environnements sur le serveur :

```bash
ssh deploy@<IP>
cd /opt/tasks-app                                 # rempli par la CI (ou par git clone / scp)
cp .env.example .env.preprod && cp .env.example .env.prod
# Dans chaque fichier : ENV_NAME, PUBLIC_URL, APP_PORT (8081 en preprod, 8080 en prod),
# et des secrets DIFFÉRENTS par environnement : openssl rand -hex 32
chmod 600 .env.preprod .env.prod
```

---

## 4. Nom de domaine, DNS et certificats HTTPS (E23) - variante VPS

### 4.1 Réservation d'un sous-domaine gratuit (DuckDNS)

1. Se connecter sur <https://www.duckdns.org> (avec un compte GitHub ou Google).
2. Créer le sous-domaine `mon-projet` (exemple), ce qui donne **`mon-projet.duckdns.org`**.
3. Dans le champ *current ip*, saisir l'**IP publique du VPS** puis cliquer sur *update ip*. Cela crée l'enregistrement DNS de type **A**.
4. DuckDNS fait aussi pointer tous les sous-niveaux (`*.mon-projet.duckdns.org`) vers cette IP, ce qui donne :

| Environnement | Nom | Type | Valeur |
|---------------|-----|------|--------|
| Production | `app.mon-projet.duckdns.org` | A (joker) | IP du VPS |
| Pré-production | `preprod.mon-projet.duckdns.org` | A (joker) | IP du VPS |
| Supervision | `monitoring.mon-projet.duckdns.org` | A (joker) | IP du VPS |

> Avec un domaine acheté (OVH, Gandi, Cloudflare…), on crée les mêmes enregistrements **A** (et **AAAA** en IPv6) dans la zone DNS. On peut aussi ajouter un enregistrement **CAA** `0 issue "letsencrypt.org"` pour n'autoriser que Let's Encrypt à émettre des certificats.

Vérification de la propagation :

```bash
dig +short app.mon-projet.duckdns.org
dig +short preprod.mon-projet.duckdns.org
```

### 4.2 Certificats HTTPS (Caddy et Let's Encrypt)

```bash
cd /opt/tasks-app/infra/proxy
cp .env.example .env            # ACME_EMAIL, domaines, hash du mot de passe de pré-production
docker run --rm caddy:2-alpine caddy hash-password --plaintext '<mot-de-passe-preprod>'
docker compose up -d
docker compose logs -f caddy    # attendre "certificate obtained successfully" pour chaque domaine
```

Caddy obtient un certificat Let's Encrypt par domaine (challenge HTTP-01 sur le port 80), le **renouvelle automatiquement** environ 30 jours avant son expiration, redirige HTTP vers HTTPS et ajoute HSTS.

Vérification des certificats (à faire pour la pré-production **et** la production) :

```bash
curl -I http://app.mon-projet.duckdns.org                  # 308 vers https://
curl -sS https://app.mon-projet.duckdns.org/api/health     # {"status":"ok","db":"up",...}
echo | openssl s_client -connect app.mon-projet.duckdns.org:443 -servername app.mon-projet.duckdns.org 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates             # émetteur Let's Encrypt et dates de validité
```

On peut compléter avec <https://www.ssllabs.com/ssltest/> (note A ou A+ attendue) ; l'alerte `CertificatExpireBientot` surveille ensuite l'expiration en continu.

---

## 5. CI/CD (E24)

### 5.1 Pipeline (`.github/workflows/ci-cd.yml`)

| Étape | Déclencheur | Contenu |
|-------|-------------|---------|
| Backend | push / PR | `npm ci`, ESLint, Prettier, 26 tests (service MongoDB), `npm audit` bloquant |
| Frontend | push / PR | `npm ci`, ESLint, Prettier, 8 tests, build Vite, `npm audit` bloquant |
| Images | push | Build Docker, push sur **GHCR** (`sha-xxxxxxx` + `preprod` / `prod`), scan **Trivy** |
| Déploiement pré-prod | push sur `develop` | Automatique |
| Déploiement prod | push sur `main` | Après **approbation manuelle** (environnement GitHub `production`) |

Le déploiement (`deploy.yml`) se déroule ainsi : rsync des fichiers de déploiement, `docker login` temporaire sur GHCR, `./deploy.sh <env> <tag>` (pull des images, `up --wait` sur les healthchecks, test de fumée, **rollback automatique** vers le tag précédent en cas d'échec), puis test de fumée HTTPS depuis GitHub.

### 5.2 Configuration GitHub (une seule fois)

```bash
# Clé SSH dédiée à la CI
ssh-keygen -t ed25519 -f ci_deploy -N "" -C "github-actions"
ssh-copy-id -i ci_deploy.pub deploy@<IP>

gh variable set DEPLOY_ENABLED --body true
gh variable set PREPROD_URL --body https://preprod.mon-projet.duckdns.org
gh variable set PROD_URL --body https://app.mon-projet.duckdns.org
for env in preprod production; do
  gh secret set SSH_HOST --env $env --body "<IP>"
  gh secret set SSH_USER --env $env --body deploy
  gh secret set SSH_PRIVATE_KEY --env $env < ci_deploy
  gh secret set SSH_KNOWN_HOSTS --env $env --body "$(ssh-keyscan -t ed25519 <IP> 2>/dev/null)"
done
rm ci_deploy ci_deploy.pub
```

Dans *Settings → Environments → production*, activer **Required reviewers** pour l'approbation manuelle. Dans *Settings → Branches*, protéger `main` (PR obligatoire et CI verte).

**Flux de travail** : branche de fonctionnalité → PR vers `develop` (CI) → merge → déploiement en pré-production → recette → PR `develop` → `main` → approbation → production.

---

## 6. Journalisation et audit (E25) - variante VPS

| Source | Contenu | Où le consulter |
|--------|---------|-----------------|
| API : stdout (JSON Winston) | Démarrage, erreurs, accès HTTP (morgan) | `docker compose -p tasks-prod logs -f backend` |
| API : `/app/logs/error.log` | Erreurs avec pile d'appels | Volume `tasks-prod_backend-logs` |
| API : `/app/logs/combined.log` | Tous les logs, au niveau `LOG_LEVEL` | idem |
| API : `/app/logs/audit.log` | **Audit sécurité** : inscription, connexion réussie ou échouée, rate-limit, accès refusé à une tâche (IDOR), origine CORS rejetée | idem |
| Caddy | Logs d'accès HTTPS au format JSON (IP, statut, durée, TLS) | `docker compose -f infra/proxy/docker-compose.yml logs caddy` |
| Déploiements | Date, environnement et tag de chaque mise en production | `/opt/tasks-app/deployments.log` et historique GitHub Actions |
| Système | SSH, fail2ban, UFW | `journalctl -u ssh`, `fail2ban-client status sshd`, `/var/log/ufw.log` |

Les fichiers tournent par taille (5 Mo × 5 fichiers, ou × 10 pour l'audit) et les logs Docker sont limités à 10 Mo × 5. Les mots de passe et tokens ne sont jamais écrits dans les logs.

```bash
# Exemples d'audit
docker exec tasks-prod-backend-1 tail -f /app/logs/audit.log
docker exec tasks-prod-backend-1 sh -c 'grep login_failed /app/logs/audit.log | tail -20'
```

Évolution possible : centraliser les logs avec Grafana Loki (ou Alloy) dans la même instance Grafana.

---

## 7. Supervision et alertes (E26) - variante VPS

```bash
cd /opt/tasks-app/infra/monitoring
cp .env.example .env                                        # mot de passe Grafana, URL du topic ntfy
cp prometheus/targets/blackbox.yml.example prometheus/targets/blackbox.yml   # vos domaines
docker compose up -d
```

Grafana est accessible sur `https://monitoring.<domaine>` (tableau de bord *Application → Application Mes Tâches*). Prometheus et Alertmanager ne sont pas exposés ; on y accède par tunnel SSH : `ssh -L 9090:localhost:9090 deploy@<IP>`, puis `docker compose port prometheus 9090`.

| Alerte | Condition | Gravité |
|--------|-----------|---------|
| SiteInaccessible | Sonde HTTPS `/api/health` en échec depuis 2 min | critique |
| ApiDown | Métriques de l'API non collectables depuis 1 min | critique |
| TauxErreurs5xx | Plus de 5 % de réponses 5xx sur 5 min | critique |
| LatenceElevee | Latence p95 > 500 ms sur 5 min | avertissement |
| MemoireApiElevee | Plus de 400 Mo de RSS pendant 10 min | avertissement |
| BruteForceSuspecte | Plus de 20 échecs de connexion en 5 min | avertissement |
| CertificatExpireBientot | Certificat TLS expirant dans moins de 14 jours | avertissement |
| DisquePresquePlein | Moins de 15 % d'espace libre | avertissement |
| CpuSature | CPU > 90 % pendant 10 min | avertissement |

**Canal de notification : ntfy (notifications push).** Aucun serveur SMTP n'étant fourni, Alertmanager envoie les alertes par webhook à [ntfy.sh](https://ntfy.sh), un service open source gratuit et sans compte. On reçoit les alertes sur son téléphone (application ntfy, Android ou iOS) ou dans le navigateur (`https://ntfy.sh/<topic>`).

1. Générer un nom de topic impossible à deviner : `echo "tasks-alertes-$(openssl rand -hex 8)"`. Il fait office de secret, car quiconque le connaît peut lire les alertes.
2. Le renseigner dans `infra/monitoring/.env` : `NTFY_URL=https://ntfy.sh/<topic>`.
3. S'abonner à ce topic dans l'application ntfy.

Le template `alertmanager` de ntfy met en forme le message (titre, gravité, instance, résumé, description). Le niveau de priorité dépend de la gravité :

| Alerte | Priorité ntfy | Rappel |
|--------|---------------|--------|
| Critique en production | `urgent` (sonnerie même en mode silencieux) | toutes les 30 min |
| Critique en pré-production | `high` | toutes les 4 h |
| Avertissement | `default` | toutes les 4 h |

Les alertes sont regroupées par environnement, un message « resolved » est envoyé au retour à la normale, et une alerte « site inaccessible » masque les alertes secondaires.

Pour ne dépendre d'aucun service externe, ntfy peut aussi être auto-hébergé (image `binwiederhier/ntfy`). Autre option : un serveur SMTP gratuit comme Brevo (300 e-mails/jour), à configurer avec `email_configs` dans Alertmanager.

**Tester une alerte** : `docker compose -p tasks-preprod stop backend`. Après environ 2 minutes, la notification « SiteInaccessible preprod » arrive. On relance ensuite le backend, ce qui envoie une notification « resolved ». On peut aussi injecter directement une fausse alerte dans Alertmanager :

```bash
docker compose exec alertmanager wget -qO- --header "Content-Type: application/json" \
  --post-data '[{"labels":{"alertname":"Test","env":"prod","severity":"critical"},"annotations":{"summary":"Alerte de test"}}]' \
  http://localhost:9093/api/v2/alerts
```

Alternative plus simple : **Uptime Kuma** (sondes HTTP avec page de statut).

---

## 8. Sauvegardes et maintenance - variante VPS

```bash
# crontab -e (utilisateur deploy) : sauvegarde quotidienne à 3 h, 7 jours conservés
0 3 * * * /opt/tasks-app/infra/scripts/backup-mongo.sh prod >> /opt/tasks-app/backups/backup.log 2>&1
```

- Mises à jour des dépendances : `npm outdated` et `npm audit` (bloquant en CI), Dependabot activable sur GitHub.
- Mises à jour des images : reconstruites à chaque push (bases `node:24-alpine` et `nginx-unprivileged`).
- Retour arrière manuel : `./deploy.sh prod sha-<ancien>` (la liste des tags est dans `deployments.log`).

---

## 9. Accès à transmettre pour la vérification

Ne jamais committer les secrets : les transmettre à l'évaluateur par un canal privé (ils sont rangés hors du dépôt).

| Élément | Valeur |
|---------|--------|
| Production | https://kevin-tasks.duckdns.org |
| Pré-production | https://preprod.kevin-tasks.duckdns.org |
| Dépôt GitHub (public) | https://github.com/KevinDaCruz/examen-blanc-tasks-app |
| Pipeline CI/CD | https://github.com/KevinDaCruz/examen-blanc-tasks-app/actions |
| Render | invitation de l'évaluateur dans le workspace (Settings → Members) |
| MongoDB Atlas | projet `examen-blanc` : invitation de l'évaluateur (Project Access Manager, rôle Read Only) |
| Grafana Cloud | https://dappercab646.grafana.net : invitation de l'évaluateur (rôle Viewer) |
| Alertes ntfy | topic transmis en privé |
| Compte de test de l'application | à créer sur le site (inscription libre) |
