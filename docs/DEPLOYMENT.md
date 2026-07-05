# Production deployment

Deploy the React dashboard on a provider such as **Netlify** or **Vercel** (`app.clarklab.tech`) and run **PostgreSQL**, the **API**, **Caddy**, and the **agent** on a headless **Debian** server (could even be a home server 😊). Expose the API at `api.clarklab.tech` and user services at `*.clarklab.tech` through a **Cloudflare Tunnel** (no port forwarding).

## 1. Prerequisites


| What?                  | Why?                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| Domain on Cloudflare   | DNS for tunnel + Vercel CNAME                                        |
| Vercel account         | Linked to this Git repository                                        |
| Debian + Docker Engine | `docker compose` v2                                                  |
| Agent host tools       | `git`, `curl`, Docker; `install.sh` adds `nixpacks`, Rust (`rustup`), and `build-essential` |


I recommend generating secrets locally for increased security. You can generate them locally using the commands below 😊

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # INTEGRATION_ENCRYPTION_KEY (must differ from JWT_SECRET)
openssl rand -hex 16   # SIGNUP_ACCESS_CODE
openssl rand -hex 24   # POSTGRES_PASSWORD
openssl rand -hex 32   # PASSWORD_RESET_TOKEN_SECRET
```

---



## 2. Cloudflare Tunnel (API + wildcard services)

On the Debian server:

```bash
git clone <your-repo-url> /opt/clarklab
cd /opt/clarklab
chmod +x scripts/setup-cloudflared-tunnel.sh
sudo scripts/setup-cloudflared-tunnel.sh clarklab-api api.clarklab.tech clarklab.tech
```

The third argument is the base domain used for the wildcard route (`*.clarklab.tech`).

This script installs `cloudflared`, logs in to Cloudflare, creates the tunnel, stores credentials under `/etc/cloudflared/`, writes `[deploy/cloudflared/config.yml.example](deploy/cloudflared/config.yml.example)` to `/etc/cloudflared/config.yml`, routes DNS for both `api.clarklab.tech` and `*.clarklab.tech`, validates the config, and enables the `[clarklab-tunnel](deploy/cloudflared/clarklab-tunnel.service)` systemd unit. It is safe to re-run; existing `/root/.cloudflared/` state is migrated automatically.

Verify the tunnel:

```bash
systemctl status clarklab-tunnel
journalctl -u clarklab-tunnel -n 20 --no-pager
```

The API container binds to `127.0.0.1:3000` and Caddy binds to `127.0.0.1:8080` only (`[docker-compose.prod.yml](docker-compose.prod.yml)`), so only `cloudflared` can reach them from outside Docker.

Specific DNS records (`api`, `app`) take priority over the wildcard `*` record in Cloudflare. Keep `app.clarklab.tech` on Vercel and `api.clarklab.tech` on the tunnel.

---



## 3. API + PostgreSQL + Caddy on Debian

```bash
cd /opt/clarklab
cp .env.production.example .env
# Edit .env before running!!
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d
systemctl restart clarklab-tunnel
```

This starts Postgres, the API, and the Caddy edge proxy. Restart the tunnel after the API container so Cloudflare does not keep returning **502** from errors logged while the API was down. The API writes `[deploy/caddy/Caddyfile](deploy/caddy/Caddyfile)` when services with subdomains deploy.

Verify the tunnel path works:

```bash
curl http://127.0.0.1:3000/api/public/status
curl https://api.clarklab.tech/api/public/status
```

If the public URL returns **502**, the API is not reachable yet. Check the API container and tunnel:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs api --tail 50
systemctl status clarklab-tunnel
systemctl restart clarklab-tunnel
curl https://api.clarklab.tech/api/public/status
```

Tunnel logs like `Unable to reach the origin service` at the same time as `docker compose up` usually mean the API was still starting. Local `curl http://127.0.0.1:3000/health` succeeding while the public URL fails is the same pattern — restart the tunnel after the API is healthy.

On the same host as the API repo, you can install the agent from the local script while debugging:

```bash
bash /opt/clarklab/scripts/install.sh \
  --token <registration-token> \
  --server https://api.clarklab.tech
```

Migrations run on API startup. Schedule backups:

```bash
chmod +x scripts/backup-postgres.sh
./scripts/backup-postgres.sh
```

---



## 4. Vercel frontend

Import the repository in Vercel. `[vercel.json](vercel.json)` at the repo root sets:


| Setting  | Value                                |
| -------- | ------------------------------------ |
| Install  | `npm ci --include=dev`               |
| Build    | `npm run build -w clarklab-frontend` |
| Output   | `clarklab-frontend/dist`             |
| Rewrites | SPA fallback to `index.html`         |


**Environment variables** (Project → Settings → Environment Variables, **Production**):

```env
VITE_API_URL=https://api.clarklab.tech
VITE_CLARKLAB_SERVER_URL=https://api.clarklab.tech
VITE_CLARKLAB_AGENT_INSTALL_URL=https://api.clarklab.tech/agent/install.sh
VITE_CLARKLAB_SERVICE_BASE_DOMAIN=clarklab.tech
VITE_GITHUB_CLIENT_ID=<oauth-app-client-id>
VITE_GITHUB_OAUTH_REDIRECT_URI=https://app.clarklab.tech/dashboard/settings
```

Add custom domain `app.clarklab.tech` in Vercel. In Cloudflare DNS, CNAME `app` → Vercel’s target (`cname.vercel-dns.com`).

Do **not** put `JWT_SECRET`, `GITHUB_CLIENT_SECRET`, or other API secrets in Vercel.

---



## 5. GitHub OAuth

Create a **GitHub OAuth App** (Settings → Developer settings → OAuth Apps):


| Field                      | Value                                          |
| -------------------------- | ---------------------------------------------- |
| Homepage URL               | `https://app.clarklab.tech`                    |
| Authorization callback URL | `https://app.clarklab.tech/dashboard/settings` |


Set on the **API** (`.env` on the server):

```env
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_OAUTH_CALLBACK_URL=https://app.clarklab.tech/dashboard/settings
```

Set `VITE_GITHUB_CLIENT_ID` to the same client ID on Vercel.

---



## 6. Agent install

On each node (can be the same Debian box as the API):

1. Dashboard → **Add node** → copy registration token.
2. As root:

```bash
curl -fsSL https://api.clarklab.tech/agent/install.sh -o /tmp/clarklab-install.sh
bash /tmp/clarklab-install.sh \
  --token <registration-token> \
  --server https://api.clarklab.tech
```

Download the script first instead of piping into `sudo` — `sudo` reads from stdin and will consume a piped installer before it runs.

1. Confirm: `systemctl status clarklab-agent`

First install compiles the agent from source (~5–10 min). Requires Rust on the node.

---

## 8. Wildcard service domains rollout

Recommended order when upgrading an existing deployment:

1. Pull the latest code on the Debian host.
2. `docker compose -f docker-compose.prod.yml up -d` to start Caddy.
3. Re-run or manually update the Cloudflare tunnel config for `*.clarklab.tech` → `http://127.0.0.1:8080`.
4. Set `CLARKLAB_SERVICE_BASE_DOMAIN`, `CLARKLAB_EDGE_PROXY_CONFIG_PATH`, and `CLARKLAB_EDGE_PROXY_ADMIN_URL` in `.env`.
5. Restart the API container so migrations run.
6. Deploy the frontend with `VITE_CLARKLAB_SERVICE_BASE_DOMAIN=clarklab.tech`.



---

## Security notes

- Keep Postgres off the public internet (`docker-compose.prod.yml` has no `5432` publish).
- API listens on `127.0.0.1:3000` and Caddy on `127.0.0.1:8080` only; Cloudflare Tunnel terminates TLS.
- Agent hosts are high-trust (Docker socket). Use dedicated `clarklab` user from `install.sh`.
- Rotate secrets if `.env` is ever exposed.

