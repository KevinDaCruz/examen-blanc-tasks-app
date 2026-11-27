#!/usr/bin/env python3
"""Provisionne la supervision Grafana Cloud de l'application (E26), de façon idempotente.

Crée ou met à jour, via l'API HTTP de Grafana :
  - le dossier « Mes Tâches » ;
  - le point de contact ntfy (notifications push) et la politique de notification ;
  - les règles d'alerte (disponibilité, API, latence, erreurs, mémoire, brute force, TLS) ;
  - le tableau de bord « Application Mes Tâches ».

Pré-requis côté Grafana Cloud (interface) :
  - Connections > Metrics Endpoint : jobs `tasks-api-prod` et `tasks-api-preprod`
    (scrape de https://<api>/metrics avec le jeton Bearer METRICS_TOKEN) ;
  - Testing & synthetics > Synthetics : sondes HTTP `site-prod` et `site-preprod`
    (créées par ce script si l'API Synthetic Monitoring est initialisée, option --sm).

Usage :
  GRAFANA_URL=https://<stack>.grafana.net GRAFANA_TOKEN=glsa_... \\
  NTFY_URL=https://ntfy.sh/<topic> python3 provision.py
"""
import json
import os
import sys
import urllib.error
import urllib.request

GRAFANA_URL = os.environ["GRAFANA_URL"].rstrip("/")
TOKEN = os.environ["GRAFANA_TOKEN"]
NTFY_URL = os.environ["NTFY_URL"]
PROM_UID = os.environ.get("PROM_UID", "grafanacloud-prom")
FOLDER_UID = "mes-taches"

API_JOBS = 'job=~".*tasks-api-(prod|preprod).*"'
SITE_JOBS = 'job=~"site-(prod|preprod)"'


def env_label(expr, pattern):
    """Ajoute un label `env` (prod / preprod) déduit du nom du job."""
    return f'label_replace({expr}, "env", "$1", "job", "{pattern}")'


def call(method, path, body=None, headers=None, ok=(200, 201, 202, 204)):
    req = urllib.request.Request(
        GRAFANA_URL + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read()
            return res.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as err:
        payload = err.read().decode()
        if err.code in ok:
            return err.code, payload
        return err.code, payload


def upsert_folder():
    code, _ = call("GET", f"/api/folders/{FOLDER_UID}")
    if code == 404:
        code, res = call("POST", "/api/folders", {"uid": FOLDER_UID, "title": "Mes Tâches"})
        print("dossier créé", code)
    else:
        print("dossier existant")


def upsert_contact_point():
    cp = {
        "uid": "ntfy-push",
        "name": "ntfy (push)",
        "type": "webhook",
        "settings": {"url": f"{NTFY_URL}?template=grafana", "httpMethod": "POST"},
        "disableResolveMessage": False,
    }
    code, _ = call("PUT", "/api/v1/provisioning/contact-points/ntfy-push", cp, {"X-Disable-Provenance": "true"})
    if code == 404 or (isinstance(_, str) and "not found" in _.lower()):
        code, _ = call("POST", "/api/v1/provisioning/contact-points", cp, {"X-Disable-Provenance": "true"})
    print("point de contact ntfy", code)


def set_policy():
    policy = {
        "receiver": "ntfy (push)",
        "group_by": ["alertname", "env"],
        "group_wait": "30s",
        "group_interval": "5m",
        "repeat_interval": "4h",
        "routes": [
            {
                "receiver": "ntfy (push)",
                "object_matchers": [["severity", "=", "critical"], ["env", "=", "prod"]],
                "repeat_interval": "30m",
            }
        ],
    }
    code, res = call("PUT", "/api/v1/provisioning/policies", policy, {"X-Disable-Provenance": "true"})
    print("politique de notification", code, "" if code < 300 else res)


def rule(uid, title, expr, op, threshold, duration, severity, summary, no_data="OK"):
    return {
        "uid": uid,
        "title": title,
        "folderUID": FOLDER_UID,
        "ruleGroup": "application",
        "condition": "C",
        "for": duration,
        "noDataState": no_data,
        "execErrState": "Error",
        "labels": {"severity": severity, "app": "tasks"},
        "annotations": {"summary": summary},
        "data": [
            {
                "refId": "A",
                "datasourceUid": PROM_UID,
                "relativeTimeRange": {"from": 900, "to": 0},
                "model": {"refId": "A", "expr": expr, "instant": True, "range": False},
            },
            {
                "refId": "C",
                "datasourceUid": "__expr__",
                "model": {
                    "refId": "C",
                    "type": "threshold",
                    "expression": "A",
                    "conditions": [{"evaluator": {"type": op, "params": [threshold]}}],
                },
            },
        ],
    }


RULES = [
    rule(
        "site-inaccessible",
        "SiteInaccessible",
        env_label(f"avg by (job) (probe_success{{{SITE_JOBS}}})", "site-(.*)"),
        "lt", 0.5, "3m", "critical",
        "Site {{ $labels.env }} inaccessible depuis l'extérieur (sondes HTTPS en échec)",
    ),
    rule(
        "api-down",
        "ApiDown",
        env_label(f"max by (job) (up{{{API_JOBS}}})", ".*tasks-api-(prod|preprod).*"),
        "lt", 1, "5m", "critical",
        "API {{ $labels.env }} injoignable (collecte /metrics en échec)",
    ),
    rule(
        "latence-elevee",
        "LatenceElevee",
        env_label(
            "histogram_quantile(0.95, sum by (le, job) "
            f'(rate(http_request_duration_seconds_bucket{{{API_JOBS}, route!="/metrics"}}[5m])))',
            ".*tasks-api-(prod|preprod).*",
        ),
        "gt", 0.5, "5m", "warning",
        "Latence p95 > 500 ms ({{ $labels.env }})",
    ),
    rule(
        "taux-erreurs-5xx",
        "TauxErreurs5xx",
        env_label(
            f'sum by (job) (rate(http_requests_total{{{API_JOBS}, status_code=~"5.."}}[5m])) '
            f"/ sum by (job) (rate(http_requests_total{{{API_JOBS}}}[5m]))",
            ".*tasks-api-(prod|preprod).*",
        ),
        "gt", 0.05, "5m", "critical",
        "Plus de 5 % d'erreurs serveur ({{ $labels.env }})",
    ),
    rule(
        "memoire-api",
        "MemoireApiElevee",
        env_label(f"max by (job) (process_resident_memory_bytes{{{API_JOBS}}})", ".*tasks-api-(prod|preprod).*"),
        "gt", 400 * 1024 * 1024, "10m", "warning",
        "Mémoire de l'API > 400 Mo ({{ $labels.env }}, limite de l'instance : 512 Mo)",
    ),
    rule(
        "brute-force",
        "BruteForceSuspecte",
        env_label(f"sum by (job) (increase(auth_login_failures_total{{{API_JOBS}}}[5m]))", ".*tasks-api-(prod|preprod).*"),
        "gt", 20, "0s", "warning",
        "Plus de 20 échecs de connexion en 5 min ({{ $labels.env }}) : brute force probable",
    ),
    rule(
        "certificat-tls",
        "CertificatExpireBientot",
        env_label(f"min by (job) ((probe_ssl_earliest_cert_expiry{{{SITE_JOBS}}} - time()) / 86400)", "site-(.*)"),
        "lt", 14, "1h", "warning",
        "Certificat HTTPS de {{ $labels.env }} expirant dans moins de 14 jours",
    ),
]


def upsert_rules():
    for r in RULES:
        code, res = call("PUT", f"/api/v1/provisioning/alert-rules/{r['uid']}", r, {"X-Disable-Provenance": "true"})
        if code == 404:
            code, res = call("POST", "/api/v1/provisioning/alert-rules", r, {"X-Disable-Provenance": "true"})
        print(f"règle {r['title']:<24}", code, "" if code < 300 else str(res)[:200])


def panel(pid, title, expr, unit, x, y, w=12, h=8, kind="timeseries", legend="{{env}}"):
    return {
        "id": pid,
        "type": kind,
        "title": title,
        "datasource": {"type": "prometheus", "uid": PROM_UID},
        "gridPos": {"x": x, "y": y, "w": w, "h": h},
        "fieldConfig": {"defaults": {"unit": unit}, "overrides": []},
        "targets": [{"refId": "A", "expr": expr, "legendFormat": legend}],
    }


def upsert_dashboard():
    api = ".*tasks-api-(prod|preprod).*"
    panels = [
        panel(1, "Disponibilité (sondes HTTPS)", env_label(f"avg by (job) (probe_success{{{SITE_JOBS}}})", "site-(.*)"), "percentunit", 0, 0, 6, 5, "stat"),
        panel(2, "API joignable", env_label(f"max by (job) (up{{{API_JOBS}}})", api), "bool_yes_no", 6, 0, 6, 5, "stat"),
        panel(3, "Expiration certificat TLS (jours)", env_label(f"min by (job) ((probe_ssl_earliest_cert_expiry{{{SITE_JOBS}}} - time()) / 86400)", "site-(.*)"), "d", 12, 0, 6, 5, "stat"),
        panel(4, "Échecs de connexion (1 h)", env_label(f"sum by (job) (increase(auth_login_failures_total{{{API_JOBS}}}[1h]))", api), "short", 18, 0, 6, 5, "stat"),
        panel(5, "Requêtes / seconde", env_label(f'sum by (job) (rate(http_requests_total{{{API_JOBS}, route!="/metrics"}}[5m]))', api), "reqps", 0, 5),
        panel(6, "Latence p95", env_label(f'histogram_quantile(0.95, sum by (le, job) (rate(http_request_duration_seconds_bucket{{{API_JOBS}, route!="/metrics"}}[5m])))', api), "s", 12, 5),
        panel(7, "Taux d'erreurs 5xx", env_label(f'sum by (job) (rate(http_requests_total{{{API_JOBS}, status_code=~"5.."}}[5m])) / sum by (job) (rate(http_requests_total{{{API_JOBS}}}[5m]))', api), "percentunit", 0, 13),
        panel(8, "Requêtes par route et statut", env_label(f'sum by (job, route, status_code) (rate(http_requests_total{{{API_JOBS}, route!="/metrics"}}[5m]))', api), "reqps", 12, 13, legend="{{env}} {{route}} {{status_code}}"),
        panel(9, "Mémoire de l'API", env_label(f"process_resident_memory_bytes{{{API_JOBS}}}", api), "bytes", 0, 21),
        panel(10, "Temps de réponse des sondes HTTPS", env_label(f"avg by (job) (probe_duration_seconds{{{SITE_JOBS}}})", "site-(.*)"), "s", 12, 21),
    ]
    dash = {
        "dashboard": {
            "uid": "tasks-app",
            "title": "Application Mes Tâches",
            "tags": ["tasks", "api", "render"],
            "timezone": "browser",
            "refresh": "1m",
            "time": {"from": "now-6h", "to": "now"},
            "panels": panels,
            "schemaVersion": 39,
        },
        "folderUid": FOLDER_UID,
        "overwrite": True,
        "message": "provisionné par infra/grafana-cloud/provision.py",
    }
    code, res = call("POST", "/api/dashboards/db", dash)
    print("tableau de bord", code, res.get("url") if isinstance(res, dict) else res)


if __name__ == "__main__":
    upsert_folder()
    upsert_contact_point()
    set_policy()
    upsert_rules()
    upsert_dashboard()
    sys.exit(0)
