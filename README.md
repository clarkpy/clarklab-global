# Clarklab

In-house homelab PaaS — Coolify-inspired control plane for you and your friends.

## Stack

- **Frontend** — React 19 + Vite + TanStack Query (`clarklab-frontend`)
- **API** — TypeScript + Hono + PostgreSQL (`clarklab-api`)
- **Agent** — Rust daemon (`clarklab-agent`)

## Quick start

```bash
cp .env.example .env
npm install
npm run dev:stack
```

- Dashboard: http://localhost:5173
- API: http://localhost:3000

The frontend uses the Vite proxy for `/api` (leave `VITE_API_URL` empty). Direct calls to `http://localhost:3000` also work — the API allows `localhost` and `127.0.0.1` dev origins via CORS with credentials.

### First account

The first user to sign up becomes the platform **sysadmin**. You need the server-side `SIGNUP_ACCESS_CODE` from `.env` to create an account. There is no demo user auto-seeded on startup.

### Teams and access

- **Teams** own one or more projects. Create a team from the dashboard, then create projects under that team.
- Teams can be **archived** or **deleted** from the team detail settings tab. Deleting a team with projects requires explicit confirmation and cascades to child projects.
- **Team roles**: `admin` (full team access), `user` (view + deploy + logs), or `custom` (checkbox permission matrix).
- **Platform roles**: `sysadmin` (global access, user management, GitHub OAuth settings) and `user` (team membership only).
- Users without project access see an access-denied page and can **request access**; team admins approve or deny requests from the team detail page.

### Node access scope

- Each node defaults to **Everyone** access: any project member with service permissions can deploy to it.
- From a node’s settings tab, restrict deployment to **Selected projects**. The create-service wizard only lists nodes available for the chosen project.

### Admin user management

- Sysadmins manage users from **Dashboard → Users**. Open a user for overview, profile settings, and security actions.
- **Lock** an account to block sign-in and revoke sessions.
- **Set password** directly, or **generate a one-time reset link** (24h TTL) to share with the user. Reset links open `/reset-password?token=…` (no email delivery yet).

### Production auth

For split-subdomain deployments (`app.example.com` + `api.example.com`):

- Set `COOKIE_DOMAIN=.example.com`
- Set `COOKIE_SECURE=true`
- Set `CORS_ORIGIN=https://app.example.com`
- Set `VITE_API_URL=https://api.example.com` on the frontend build
- Use strong, distinct values for `JWT_SECRET` and `INTEGRATION_ENCRYPTION_KEY`

Sessions use HttpOnly cookies (short-lived access token + rotating refresh token). Logout bumps a server-side `token_version` so access tokens stop working immediately. SSE streams authenticate via cookies (`withCredentials`), not URL tokens.

Full runbook: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (Vercel frontend + Debian API/agent + Cloudflare Tunnel).

### Secrets

Never commit `.env` or `agent.yaml`. Copy [`.env.example`](.env.example) to `.env` at the repo root and fill in values locally. The root `.gitignore` excludes env files, keys, and agent credentials.

## Mock mode

Set `VITE_USE_MOCK=true` in `.env` to run the dashboard against an in-memory store (no API required). A banner appears when mock mode is active. Mock auth uses in-memory credentials only.

Default is live API mode (`VITE_USE_MOCK=false`).

## Health check

```bash
curl http://localhost:3000/health
```

Expected: `{"status":"ok","version":"0.1.0"}`

If this fails, start Postgres first: `docker compose up -d postgres`

## API surface

| Area | Endpoints |
|------|-----------|
| Auth | `POST /api/auth/login`, `signup`, `refresh`, `logout`, `reset-password`, `GET /me` |
| Teams | `GET/POST /api/teams`, `PATCH/DELETE /:id`, members, projects, access requests |
| Users (sysadmin) | `GET/PATCH/DELETE /api/users/:id`, `POST /:id/password-reset-token` |
| Nodes | `GET /api/nodes?projectId=`, `PATCH /:id` (access scope), `POST /register-token`, agent register/heartbeat |
| Projects | `GET/POST /api/projects`, `PATCH/DELETE /:id` |
| Services | CRUD, `deploy`, `start`, `stop`, `restart`, environment, deployments, logs |
| Logs | `GET /api/logs`, `GET /api/services/:id/logs` |
| Dashboard | `GET /api/dashboard/summary` (auth), `GET /api/public/status` (counts only) |
| Events | `GET /api/events/nodes` (SSE) |
| Settings | `GET/PATCH /api/settings` |
| Integrations | `GET/PUT/DELETE /api/integrations/github` (OAuth + PAT) |
| Agent tasks | Heartbeat returns `pendingTasks`; `POST /api/agent/tasks/:id/complete` |

Deploy actions queue `deploy_tasks` for the node agent. The agent pulls Docker images for database services, clones and builds GitHub repos with Nixpacks, runs containers, and reports back via `POST /api/agent/tasks/:id/complete`. Supported database templates: PostgreSQL, MySQL, MongoDB, Redis.

### GitHub integration

Connect GitHub under **Settings → Integrations** (OAuth or Personal Access Token with `repo` scope). Tokens are encrypted at rest and never stored in service deploy config.

### Git deploy flow

1. Connect GitHub in Settings, then create a git service with repository URL and branch.
2. Deploy queues a task with commit SHA resolved from GitHub (credentials sent as a one-time HTTP header at heartbeat, not embedded in clone URLs).
3. Agent clones the repo with `git -c http.extraHeader=…`, sanitizes the remote URL, runs `nixpacks build` on the node (uses the local Docker daemon), and runs `clarklab-<serviceEnvironmentId>:latest`.
4. Nixpacks needs a start command. The agent infers one from `package.json` (`start` or `preview` scripts), or you can set **Start command** when creating the service. For monorepos, set **Root directory** to the app folder (for example `clarklab-api`).

**Node prerequisites for git deploy:** `git`, `nixpacks`, Docker, and access to `/var/run/docker.sock`.

**Agent trust boundary:** A node agent can run arbitrary containers via the Docker socket. Treat agent hosts as high-trust machines. Production installs run as a dedicated `clarklab` user (not root) with `agent.yaml` mode `600`. Use HTTPS for `CLARKLAB_SERVER_URL`.

On Apple Silicon Macs with OrbStack, the agent generates a Nixpacks Dockerfile, strips the broken `nix-collect-garbage` step, and runs `docker build` with `linux/arm64`. Override with `CLARKLAB_NIXPACKS_PLATFORM` on the agent host if needed.

### Database deploy flow

1. Create a database service on an online node (auto-queues initial deploy).
2. API sets service status to `deploying` and deployment to `queued`.
3. Agent heartbeat claims pending tasks and runs `docker pull` / `docker run`.
4. Agent posts task completion with `containerId`; API sets status to `running`.
5. Data persists under the node’s configured data directory (default `/var/lib/clarklab/services/<serviceEnvironmentId>/data`).

### Node data directory

- Set during **Add node** or on the node **Setup** tab before running `register`.
- Change later under **Node settings → Agent → Data directory**.
- Optional **Migrate existing data** moves service subdirectories when changing paths; the agent applies this on the next heartbeat.
- Production default: `/var/lib/clarklab/services` (requires write access — `install.sh` creates it when run with `sudo`).
- Local dev without sudo: use `~/.clarklab/services` in the dashboard or `agent.yaml`.

The agent also accepts `--data-root` on `register` and stores the path in `agent.yaml`. `install.sh` supports `--data-root <path>` and verifies `git`, `nixpacks`, and Docker are installed.

Configure GitHub OAuth in `.env`:

- Frontend: `VITE_GITHUB_CLIENT_ID` (OAuth app client ID) and optional `VITE_GITHUB_OAUTH_REDIRECT_URI` (defaults to `{origin}/dashboard/settings`)
- API: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_OAUTH_CALLBACK_URL` matching the frontend redirect URI
- `INTEGRATION_ENCRYPTION_KEY` for encrypted token storage

Register the frontend settings URL as the GitHub OAuth app callback (not the API).

## End-to-end node registration test

### Step 1 — Start the stack

```bash
cp .env.example .env
npm install
docker compose up -d postgres
npm run dev
```

### Step 2 — Verify API auth

```bash
curl http://localhost:3000/health

curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"Demo123!"}'
```

Save the `token` from the response.

### Step 3 — Create a pending node

```bash
curl -X POST http://localhost:3000/api/nodes/register-token \
  -H "Authorization: Bearer <token>"
```

Save `token` and `nodeId` from the response.

### Step 4 — Register and run the agent

```bash
cd clarklab-agent
cargo build --release

./target/release/clarklab-agent register \
  --token <token> \
  --server http://localhost:3000 \
  --config ./agent.yaml

./target/release/clarklab-agent run --config ./agent.yaml
```

### Step 5 — Verify in the UI

1. Open http://localhost:5173
2. Login as `demo` / `Demo123!`
3. Go to **Nodes** — the pending node should flip to `online` within 30 seconds

### Step 6 — Verify offline detection

Stop the agent process. Wait ~90 seconds. The node should show `offline` on the next poll.

### Step 7 — Deploy a database service

1. Create a MySQL, PostgreSQL, MongoDB, or Redis service on the online node.
2. Deploy from the service detail page (or rely on auto-deploy on create).
3. Within one heartbeat interval, the agent pulls the image and starts the container.
4. On the node: `docker ps` should show `clarklab-<serviceEnvironmentId>`.
5. Data is stored at `/var/lib/clarklab/services/<serviceEnvironmentId>/data`.

Optional `data_root` in `agent.yaml` overrides the default services data path.

## Docker Compose (API + Postgres)

```bash
docker compose up -d
```

Runs Postgres and the API container on port 3000. Build the frontend separately for local dev, or serve a static build behind your reverse proxy.

## Tests

```bash
docker compose up -d postgres
npm test
npm run test:e2e
```

API tests use Vitest against a live Postgres database. E2E smoke test uses Playwright against the Vite dev server.

## Project layout

```
clarklab-global/
├── clarklab-api/       Control plane REST API
├── clarklab-agent/     Rust node agent
├── clarklab-frontend/  React dashboard
├── scripts/install.sh  Agent installer
└── docker-compose.yml  Postgres + API
```

## Troubleshooting

### `Cannot find module .../vite/dist/node/chunks/dist.js`

This means the Vite package in `node_modules` is incomplete (common after a partial install or running `npm install` only inside `clarklab-frontend`).

**Fix — always install from the repo root:**

```bash
npm run reinstall
npm run dev:stack
```

If you prefer a manual clean:

```bash
rm -rf node_modules clarklab-api/node_modules clarklab-frontend/node_modules
rm -rf clarklab-frontend/node_modules/.vite
npm install
```

Do not run `npm install` inside `clarklab-frontend` alone; use the root workspace so Vite is hoisted correctly.

### Agent: `Permission denied` creating data directory

The agent needs a writable data directory for database volumes.

**During setup** — set the data directory in the dashboard when adding a node, or pass `--data-root` to `clarklab-agent register`.

**After setup** — change it under Node settings. Enable **Migrate existing data** if you want the agent to move existing service directories on the next heartbeat.

**Local dev** — use `~/.clarklab/services` in the dashboard or in `agent.yaml`:

```yaml
data_root: ~/.clarklab/services
```

**Production node** — default is `/var/lib/clarklab/services`:

```bash
sudo mkdir -p /var/lib/clarklab/services
sudo chown -R "$(whoami)" /var/lib/clarklab
```

Or re-run `install.sh` with `sudo`; it creates the directory and sets ownership.

## Repo hygiene

Never commit secrets. Keep `.env`, `agent.yaml`, and key files out of git (see **Secrets** above).

If `clarklab-frontend/.git` exists from an earlier standalone checkout, remove it so the monorepo uses a single root git repository:

```bash
rm -rf clarklab-frontend/.git
```


- **SSE** for node updates is in-memory (single API instance). Restarting the API clears subscribers; node state persists in Postgres.
- **Schema** is applied via numbered SQL migrations in `clarklab-api/src/db/migrations/`.
- **Service logs** are written by the API on deploy/lifecycle actions until the agent streams container output.
