# ClarkLab


## Notice

> This project is still in alpha so the live demo is limited, you can build the full project using this source code and a youtube preview link is available here: 
> https://youtu.be/lLkWigWAXwQ

### Quick start

```bash
npm install
npm run setup
npm run dev:stack
```

- Dashboard: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:3000](http://localhost:3000)

### First account

The first user to sign up becomes the platform **sysadmin**. You need the server-side `SIGNUP_ACCESS_CODE` from `.env` to create an account. There is no user auto-seeded on startup.

### Production auth

split-subdomain deployments (`app.clarklab.tech` + `api.clarklab.tech`):

- Set `COOKIE_DOMAIN=.clarklab.tech`
- Set `COOKIE_SECURE=true`
- Set `CORS_ORIGIN=https://app.clarklab.tech`
- Set `VITE_API_URL=https://api.clarklab.tech` on the frontend build
- Use strong values for `JWT_SECRET` and `INTEGRATION_ENCRYPTION_KEY`



### Secrets

Never commit `.env` or `agent.yaml`. Copy `[.env.example](.env.example)` to `.env` at the repo root and fill in values locally. The root `.gitignore` excludes env files, keys, and agent credentials.

### Service health checks

Configure container health checks per service in **Settings → Health Checks**. The dashboard shows **Not configured**, **Pending**, **Passed**, or **Failed**. A failed check automatically stops the service.

### Project layout

```
clarklab-global/
├── clarklab-api/       Control plane REST API
├── clarklab-agent/     Rust node agent
├── clarklab-frontend/  React dashboard
├── scripts/install.sh  Agent installer
└── docker-compose.yml  Postgres + API
```
