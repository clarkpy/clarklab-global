# Production deployment

Deploy the React dashboard on a provider such as **Netlify** or **Vercel** (`app.clarklab.tech`) and run **PostgreSQL**, the **API**, **Caddy**, and the **agent** on a headless **Debian** server (could even be a home server 😊). Expose the API at `api.clarklab.tech` and user services at `*.clarklab.tech` through a **Cloudflare Tunnel** (no port forwarding).

## 1. Prerequisites


| What?                  | Why?                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| Domain on Cloudflare   | DNS for tunnel + Vercel CNAME                                        |
| Vercel account         | Linked to this Git repository                                        |
| Debian + Docker Engine | `docker compose` v2                                                  |
| Agent host tools       | `git`, `curl`, Rust (`rustup`), Docker; `install.sh` adds `nixpacks` |


I recommend generating secrets locally for increased security. You can generate them locally using the commands below 😊

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # INTEGRATION_ENCRYPTION_KEY (must differ from JWT_SECRET)
openssl rand -hex 16   # SIGNUP_ACCESS_CODE
openssl rand -hex 24   # POSTGRES_PASSWORD
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

This script installs `cloudflared`, creates the tunnel, writes `[deploy/cloudflared/config.yml.example](deploy/cloudflared/config.yml.example)` to `/etc/cloudflared/config.yml`, routes DNS for both `api.clarklab.tech` and `*.clarklab.tech`, and enables the `[clarklab-tunnel](deploy/cloudflared/clarklab-tunnel.service)` systemd unit.

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
```

This starts Postgres, the API, and the Caddy edge proxy. The API writes `[deploy/caddy/Caddyfile](deploy/caddy/Caddyfile)` when services with subdomains deploy.

Verify:

```bash
curl https://api.clarklab.tech/health
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
curl -fsSL https://api.clarklab.tech/agent/install.sh | sudo bash -s -- \
  --token <registration-token> \
  --server https://api.clarklab.tech
```

1. Confirm: `systemctl status clarklab-agent`

First install compiles the agent from source (~5–10 min). Requires Rust on the node.

---



## 7. Production smoke test

From any machine with network access:

```bash
chmod +x scripts/smoke-test-production.sh
API_URL=https://api.clarklab.tech \
APP_URL=https://app.clarklab.tech \
SIGNUP_ACCESS_CODE=<your-code> \
./scripts/smoke-test-production.sh
```

Manual checklist:

1. `curl https://api.clarklab.tech/health` → `{"status":"ok",...}`
2. Open `https://app.clarklab.tech` → landing page
3. Sign up with access code → first user is sysadmin
4. Dashboard loads (cookie auth)
5. Service or agent log stream connects (SSE)
6. Node shows online after agent install
7. Deploy a test service with subdomain `hello` → `https://hello.clarklab.tech` loads after deploy
8. GitHub OAuth under Settings → Integrations
9. Logout revokes session

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



## Environment matrix


| Variable                                                           | Where        | Purpose                                              |
| ------------------------------------------------------------------ | ------------ | ---------------------------------------------------- |
| `NODE_ENV=production`                                              | API `.env`   | Secret validation, secure cookies                    |
| `POSTGRES_PASSWORD`                                                | API `.env`   | Postgres + `DATABASE_URL`                            |
| `JWT_SECRET`, `INTEGRATION_ENCRYPTION_KEY`, `SIGNUP_ACCESS_CODE`   | API `.env`   | Auth and encryption                                  |
| `CORS_ORIGIN`, `COOKIE_DOMAIN`, `COOKIE_SECURE`                    | API `.env`   | Cross-subdomain cookies                              |
| `CLARKLAB_SERVER_URL`, `CLARKLAB_AGENT_INSTALL_URL`                | API `.env`   | Agent and install URLs                               |
| `CLARKLAB_SERVICE_BASE_DOMAIN`, `CLARKLAB_RESERVED_SUBDOMAINS`     | API `.env`   | Wildcard service hostnames                           |
| `CLARKLAB_EDGE_PROXY_CONFIG_PATH`, `CLARKLAB_EDGE_PROXY_ADMIN_URL` | API `.env`   | Caddy routing sync                                   |
| `GITHUB_*`                                                         | API `.env`   | OAuth token exchange                                 |
| `VITE_*`                                                           | Vercel build | Browser API URL, OAuth redirect, service base domain |


Template: `[.env.production.example](.env.production.example)`

---



## Security notes

- Keep Postgres off the public internet (`docker-compose.prod.yml` has no `5432` publish).
- API listens on `127.0.0.1:3000` and Caddy on `127.0.0.1:8080` only; Cloudflare Tunnel terminates TLS.
- Agent hosts are high-trust (Docker socket). Use dedicated `clarklab` user from `install.sh`.
- Rotate secrets if `.env` is ever exposed.

