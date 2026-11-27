# Mise en production : hébergement, CI/CD, journalisation, supervision

Ce guide couvre les compétences E21 à E26. Les corrections de code (E27 à E29) sont décrites dans le [CHANGELOG](../CHANGELOG.md).

---

## 1. Choix de l'hébergement (E21)

L'application est composée de trois services légers (nginx, Node.js, MongoDB), conteneurisés, et doit fonctionner dans **deux environnements** (pré-production et production). Elle sera déployée sur un **VPS Linux avec Docker Compose**.

| Critère | VPS + Docker (retenu) | PaaS (Render, Railway) + MongoDB Atlas | Kubernetes managé (GKE, AKS, Kapsule) |
|---------|-----------------------|----------------------------------------|----------------------------------------|
| Coût | 4 à 6 €/mois pour les 2 environnements | Gratuit mais limité (mise en veille), puis environ 7 $/service/mois | Plus de 50 €/mois |
| Performance | Ressources dédiées, pas de démarrage à froid | Démarrage à froid de 30 à 60 s en offre gratuite | Très bonne, mais surdimensionnée ici |
| Maîtrise et sécurité | Contrôle complet : pare-feu, SSH, réseau Docker, versions | Dépend du fournisseur ; base hébergée ailleurs | Complexe à sécuriser |
| Maintenance | Mises à jour système à gérer (automatisées par `unattended-upgrades`) | Minimale | Élevée |
| Supervision | Prometheus, Grafana et alertes libres | Limitée aux outils du fournisseur | Complète |
| Données (RGPD) | Datacenter choisi (France ou UE) | Souvent aux États-Unis par défaut | Au choix |
| Portabilité | Même `docker-compose.yml` partout | Configuration propre au fournisseur | Manifests Kubernetes |

**Fournisseurs envisagés** (Ubuntu 24.04, 2 vCPU, 2 à 4 Go de RAM, environ 40 Go de disque) : Hetzner Cloud CX22 (UE), Scaleway (France), OVHcloud VPS (France), ou DigitalOcean (crédit offert par le GitHub Student Pack).

> Fournisseur retenu : **_à compléter_** · Datacenter : **_à compléter_** · IP publique : **_à compléter_**

---

## 2. Architecture cible

```
                    DNS : app / preprod / monitoring.<domaine>  ─►  IP du VPS
                                         │
                         ┌───────────────▼────────────────┐   UFW : seuls 22, 80, 443 ouverts
                         │ Caddy :80 :443 (Let's Encrypt) │   fail2ban, SSH par clé uniquement
                         └──┬──────────────┬───────────┬──┘
           tasks-prod-net   │              │           │ monitoring-net
          ┌─────────────────▼─┐  ┌─────────▼─────────┐ ┌▼──────────────────────────────┐
          │ frontend-prod     │  │ frontend-preprod  │ │ Grafana ◄─ Prometheus ─► Alert │
          │ nginx (non-root)  │  │ (mot de passe)    │ │   manager (e-mail)             │
          │   │ /api          │  │   │ /api          │ │ Blackbox (sondes HTTPS + TLS)  │
          │ backend-prod      │  │ backend-preprod   │ │ node-exporter (serveur)        │
          │   │ réseau interne│  │   │               │ └────────────────────────────────┘
          │ mongo-prod (auth) │  │ mongo-preprod     │
          └───────────────────┘  └───────────────────┘
```

- Chaque environnement est un projet Docker Compose isolé (`tasks-prod`, `tasks-preprod`) avec sa propre base, ses propres secrets et son propre réseau.
- MongoDB est sur un réseau Docker `internal` : il n'a ni accès Internet ni port publié.
- Le frontend (nginx) sert le build React et relaie `/api` vers l'API, ce qui permet d'avoir une seule origine : cookie `SameSite=Strict` et pas de CORS cross-site.

---

## 3. Préparation et sécurisation du serveur (E22)

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

## 4. Nom de domaine, DNS et certificats HTTPS (E23)

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

## 6. Journalisation et audit (E25)

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

## 7. Supervision et alertes (E26)

```bash
cd /opt/tasks-app/infra/monitoring
cp .env.example .env                                        # mot de passe Grafana, SMTP, destinataire
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

Les alertes sont envoyées **par e-mail** (Alertmanager, SMTP). Elles sont regroupées par environnement, les alertes critiques de production sont répétées toutes les 30 minutes, et une alerte « site inaccessible » masque les alertes secondaires.

**Tester une alerte** : `docker compose -p tasks-preprod stop backend`. Après environ 2 minutes, l'e-mail « SiteInaccessible preprod » arrive ; on relance ensuite le backend, ce qui envoie un e-mail « resolved ».

Alternative plus simple : **Uptime Kuma** (sondes HTTP avec page de statut).

---

## 8. Sauvegardes et maintenance

```bash
# crontab -e (utilisateur deploy) : sauvegarde quotidienne à 3 h, 7 jours conservés
0 3 * * * /opt/tasks-app/infra/scripts/backup-mongo.sh prod >> /opt/tasks-app/backups/backup.log 2>&1
```

- Mises à jour des dépendances : `npm outdated` et `npm audit` (bloquant en CI), Dependabot activable sur GitHub.
- Mises à jour des images : reconstruites à chaque push (bases `node:24-alpine` et `nginx-unprivileged`).
- Retour arrière manuel : `./deploy.sh prod sha-<ancien>` (la liste des tags est dans `deployments.log`).

---

## 9. Accès à transmettre pour la vérification

Ne jamais les committer : les transmettre à l'évaluateur par un canal privé.

| Élément | Valeur |
|---------|--------|
| Production | https://app.______.duckdns.org |
| Pré-production | https://preprod.______.duckdns.org (utilisateur / mot de passe basic auth) |
| Grafana | https://monitoring.______.duckdns.org (compte lecteur) |
| Dépôt GitHub | https://github.com/______/______ |
| Serveur | `ssh deploy@<IP>` (clé publique de l'évaluateur à ajouter) |
| Compte de test de l'application | utilisateur / mot de passe |
