#!/usr/bin/env bash
# =============================================================================
# Préparation et sécurisation d'un VPS Ubuntu 24.04 / Debian 12 (E22).
# À lancer UNE FOIS, en root :  sudo bash server-setup.sh
#
# - mises à jour + mises à jour de sécurité automatiques
# - Docker Engine + plugin compose (dépôt officiel)
# - utilisateur "deploy" (sans mot de passe, clé SSH) utilisé par la CI
# - SSH durci : pas de connexion root, pas de mot de passe
# - pare-feu UFW : seuls 22, 80, 443 ouverts
# - fail2ban contre le brute force SSH
# - rotation des logs Docker, réseaux Docker partagés, dossier de l'application
#
# ATTENTION : vérifiez que vous pouvez vous connecter avec "ssh deploy@<IP>"
# AVANT de fermer votre session root actuelle.
# =============================================================================
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_DIR="${APP_DIR:-/opt/tasks-app}"
[ "$(id -u)" -eq 0 ] || { echo "À exécuter en root (sudo)"; exit 1; }

echo "==> Mises à jour système"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q && apt-get upgrade -yq
apt-get install -yq ca-certificates curl ufw fail2ban unattended-upgrades rsync
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
mkdir -p /etc/docker
cat >/etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true
}
JSON
systemctl restart docker

echo "==> Utilisateur $DEPLOY_USER"
id "$DEPLOY_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
SRC_KEYS="/root/.ssh/authorized_keys"
[ -n "${SUDO_USER:-}" ] && [ -f "/home/$SUDO_USER/.ssh/authorized_keys" ] && SRC_KEYS="/home/$SUDO_USER/.ssh/authorized_keys"
if [ -f "$SRC_KEYS" ]; then
  cat "$SRC_KEYS" >>"/home/$DEPLOY_USER/.ssh/authorized_keys"
  sort -u -o "/home/$DEPLOY_USER/.ssh/authorized_keys" "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys" 2>/dev/null || true
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys" 2>/dev/null || true

echo "==> Durcissement SSH"
cat >/etc/ssh/sshd_config.d/99-hardening.conf <<'CONF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
MaxAuthTries 3
X11Forwarding no
CONF
sshd -t && (systemctl reload ssh 2>/dev/null || systemctl reload sshd)

echo "==> Pare-feu UFW"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
# Remarque : Docker contourne UFW pour les ports publiés. C'est pourquoi seuls
# Caddy (80/443) publie sur 0.0.0.0 ; le frontend écoute sur 127.0.0.1 et
# MongoDB / l'API ne publient aucun port.

echo "==> fail2ban"
systemctl enable --now fail2ban

echo "==> Dossier applicatif et réseaux Docker"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR" "$APP_DIR/backups"
for n in tasks-prod-net tasks-preprod-net monitoring-net; do
  docker network inspect "$n" >/dev/null 2>&1 || docker network create "$n" >/dev/null
done

echo "==> Terminé. Testez maintenant : ssh $DEPLOY_USER@<IP_DU_SERVEUR>"
