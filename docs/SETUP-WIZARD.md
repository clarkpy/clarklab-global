# ClarkLab setup wizard

The wizard configures the control-plane backend and produces the ENV vars required by the dashboard build. When ran on the Linux backend host, production setup can also run the Tunnel installer after showing the DNS plan and receiving confirmation.

## Run it

From a clean machine:

```bash
git clone https://github.com/clarkpy/clarklab-global.git
cd clarklab-global
npm install
npm run setup
```

Choose **local development** or **production** and answer each question. Press Enter to accept a value shown in brackets. In production, accept automatic secret generation unless you have an existing secret-management system.

The wizard writes:

- `.env`
- `clarklab-frontend/.env.setup`: For copying to frontend such as Vercel.
- `.env.backup-<timestamp>`

For local development, continue with:

```bash
npm run dev:stack
```

Open `http://localhost:5173`. The first user signs up with the generated `SIGNUP_ACCESS_CODE` in `.env`.

For production, first add `app.<your-domain>` to the Vercel project and copy the exact CNAME target Vercel displays. Copy every line from `clarklab-frontend/.env.setup` into Vercel (or the chosen frontend host). On the backend host run:

```bash
npm run prod:build
npm run prod:up
docker compose -f docker-compose.prod.yml ps
curl http://127.0.0.1:3000/api/public/status
```

## Cloudflare setup

The Cloudflare option configures these records:

- `api.<your-domain>` routes through Cloudflare Tunnel to the API on `127.0.0.1:3000`.
- `*.<your-domain>` routes through Cloudflare Tunnel to Caddy on `127.0.0.1:8080`.
- `app.<your-domain>` is an unproxied CNAME to the exact target supplied by the frontend host.

```bash
read -rsp "Cloudflare API token: " CLOUDFLARE_API_TOKEN
echo
export CLOUDFLARE_API_TOKEN
npm run setup
unset CLOUDFLARE_API_TOKEN
```

## Release-version discovery

The wizard obtains the current stable agent version from:

```text
https://github.com/clarkpy/clarklab-global/releases/latest/download/latest-version.json
```

The workflow generates and publishes that file after both Linux binaries build and pass tests. The wizard validates the schema, semantic version, and `agent-v<version>` tag. If GitHub is busy, it explains the failure and offers the local fallback version.

## External accounts the wizard refers to

- Dashboard hosting: Vercel project settings, or equivalent static hosting.
- GitHub integration: GitHub → Settings → Developer settings → OAuth Apps. Set the homepage to the generated dashboard URL and callback to `<dashboard-url>/dashboard/settings`.
- Nodes: after the backend and dashboard are running, use Dashboard → Add node. Node registration credentials are created there, not in `.env`.

## Complete variable reference

Backend variables belong only in the root `.env`.

| Variable | Purpose / available option |
| --- | --- |
| `POSTGRES_PASSWORD` | Production database password. The wizard generates 48 URL-safe hex characters. |
| `NODE_ENV` | `development` or `production`, selected by the deployment profile. |
| `PORT` | API listening port, `1–65535`; default `3000`. |
| `DATABASE_URL` | PostgreSQL connection URL. Derived from profile and database password. |
| `LATEST_AGENT_VERSION` | Semantic version advertised by the API; normally discovered from the latest successful GitHub release. |
| `JWT_SECRET` | Signs access tokens; unique, generated, and at least 32 characters in production. |
| `PASSWORD_RESET_TOKEN_SECRET` | Signs password reset tokens; unique and generated. |
| `INTEGRATION_ENCRYPTION_KEY` | Encrypts stored integration credentials; unique and different from `JWT_SECRET`. |
| `SIGNUP_ACCESS_CODE` | Code required by the first-account signup flow; unique and generated. |
| `ACCESS_TOKEN_TTL_SECONDS` | Access-token lifetime; minimum `60`, default `900`. |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh-token lifetime; minimum `1`, default `30`. |
| `REGISTRATION_TOKEN_TTL_MINUTES` | Node registration lifetime; `15–10080`, default `1440`. |
| `CLARKLAB_SERVER_URL` | Public API URL; local HTTP or production HTTPS. Derived from the domain. |
| `CLARKLAB_AGENT_INSTALL_URL` | Public agent installer URL; derived as `<API>/agent/install.sh`. |
| `CORS_ORIGIN` | Allowed dashboard origin. Multiple origins may be comma-separated. |
| `COOKIE_DOMAIN` | Empty locally; `.<base-domain>` in the split-subdomain production profile. |
| `COOKIE_SECURE` | `false` locally and `true` in production. |
| `CLARKLAB_APP_BRAND_NAME` | Default dashboard name; default `ClarkLab`. |
| `CLARKLAB_APP_DOMAIN` | Default application domain; `localhost` or the production base domain. |
| `GITHUB_CLIENT_ID` | Optional OAuth App client ID. Safe to expose in the frontend too. |
| `GITHUB_CLIENT_SECRET` | Optional OAuth App secret. Backend only. |
| `GITHUB_OAUTH_CALLBACK_URL` | Dashboard OAuth callback, derived from the dashboard URL. |
| `GITHUB_TEST_TOKEN` | Optional development/testing token; normally blank. Never put it in frontend settings. |
| `CLARKLAB_SERVICE_BASE_DOMAIN` | Base domain for deployed service subdomains; blank locally. |
| `CLARKLAB_RESERVED_SUBDOMAINS` | Comma-separated names unavailable to services; default `api,app,www`. |
| `CLARKLAB_EDGE_PROXY_CONFIG_PATH` | Caddy config path; `/data/caddy/Caddyfile` in production. |
| `CLARKLAB_EDGE_PROXY_ADMIN_URL` | Caddy admin API; `http://caddy:2019` in production. |
| `CLARKLAB_HOST_REPO_PATH` | Repository mount used by API self-update; `/host/clarklab` in production. |
| `CLARKLAB_DOCKER_COMPOSE_FILE` | Compose file used by API self-update. |

The frontend file contains only build-time public values: `VITE_API_URL`, `VITE_GITHUB_CLIENT_ID`, `VITE_GITHUB_OAUTH_REDIRECT_URI`, `VITE_CLARKLAB_SERVER_URL`, `VITE_CLARKLAB_AGENT_INSTALL_URL`, `VITE_CLARKLAB_SERVICE_BASE_DOMAIN`, `VITE_APP_BRAND_NAME`, `VITE_APP_DOMAIN`, `VITE_REGISTRATION_TOKEN_TTL_MINUTES`, and `VITE_LATEST_AGENT_VERSION`. Vite embeds all of these into browser JavaScript; never add a secret to a `VITE_` variable.

## Re-running and recovery

The wizard validates all values before writing. Writes use a temporary file followed by an atomic rename. If `.env` already exists, the wizard creates a timestamped backup first. To restore it:

```bash
cp .env.backup-<timestamp> .env
chmod 600 .env
```
