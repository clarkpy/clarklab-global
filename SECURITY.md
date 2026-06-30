# Security at Clarklab

Hey, thanks for looking at this project seriously.

Clarklab is **alpha software** built for a **homelab**: a small control plane you run yourself, on hardware you trust, for people you mostly know. It is **not** a hardened multi-tenant SaaS. Treat it that way.

## The honest bit

This codebase is young. There **will** be bugs. There **may** be security gaps i have not found yet. Features ship before polish. Agents talk to Docker with real power. If you point this at the open internet without thinking, you are accepting that risk.

**Do not** deploy Clarklab like a public product and expect enterprise-grade isolation. **Do** run it on a network you control, with signup locked down, and with nodes you would let a friend SSH into anyway.

## What you are trusting

- **The API** holds passwords (hashed), session tokens, env vars, and GitHub credentials (encrypted at rest when configured).
- **The agent** on each node has Docker socket access. Compromise there is effectively compromise of that host.
- **Your browser** talks to the API over HTTPS in production; cookies and JWTs gate the dashboard.
- **Deployed apps** on `*.yourdomain` are your responsibility — a leaky container is still your leaky container.

I document the model in `docs/DEPLOYMENT.md`. Read it before you expose anything past your LAN.

## Reporting a vulnerability

If you find something that could hurt someone running Clarklab, please tell me privately first.

**Email:** aj@clarklab.tech  
*(If you do not receive a response within 24 hours, open a **private** GitHub security advisory on this repository as well.)*

Please include:

- What you found and where (file, route, or flow helps a lot)
- Steps to reproduce
- What an attacker could realistically do in a homelab setup
- Your environment (Clarklab version, OS, rough topology) if you know it

I will acknowledge as soon as i can, investigate, and work on a fix. i cannot promise SLAs — this is a side project — but i do take real reports seriously.

**Please do not** open public GitHub issues for exploitable security problems. That gives everyone else a head start.

## What i am not looking for

To save everyone time:

- Issues that require physical access to your server or your `.env` file
- Missing rate limits or hardening on a dev-only `localhost` setup
- Vulnerabilities in dependencies already fixed upstream (tell us the advisory ID)
- Theoretical attacks with no practical path in a typical homelab deployment

Low-risk findings are still welcome; i just may prioritize them after sharper problems.

## Safe defaults i recommend

If you run your own instance:

1. Use strong, unique `JWT_SECRET`, `INTEGRATION_ENCRYPTION_KEY`, and `SIGNUP_ACCESS_CODE`.
2. Keep signup closed or use a long random access code — do not publish it in the repo.
3. Prefer **Cloudflare Tunnel** (or similar) over punching holes in your router.
4. Run agents on dedicated hosts, not your daily driver laptop.
5. Do not deploy sensitive workloads on a Clarklab setup you have not updated in months.
6. Back up Postgres (`scripts/backup-postgres.sh`) before you trust it with anything important.

## Alpha means alpha

If Clarklab is not the right fit for your threat model, that is a valid outcome. Self-hosting should feel cozy, not reckless.

Thanks for helping keep homelabs a little safer.

— AJ Clark
