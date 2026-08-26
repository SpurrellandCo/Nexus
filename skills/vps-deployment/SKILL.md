---
name: vps-deployment
description: Deployment patterns for Hostinger VPS — PM2 process management, Nginx reverse proxy, SSL via Certbot, zero-downtime deploys, environment management, and GitHub Actions CI/CD. Use when deploying your app's API or any Node.js service to production.
origin: custom
---

# VPS Deployment

Zero-downtime deployment for Node.js services on Hostinger VPS with PM2, Nginx, and GitHub Actions.

## When to Activate

- Deploying your app's API or frontend to Hostinger VPS
- Setting up Nginx reverse proxy for a new service
- Configuring SSL/TLS certificates
- Debugging deployment failures or process crashes
- Setting up CI/CD via GitHub Actions
- Managing environment variables on the server

## Stack

- **OS:** Ubuntu 22.04 LTS (Hostinger VPS)
- **Node.js:** via `nvm`
- **Process manager:** PM2
- **Reverse proxy:** Nginx
- **SSL:** Certbot (Let's Encrypt)
- **CI/CD:** GitHub Actions → SSH deploy

## PM2 Ecosystem Config

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'your-app-api',
    script: 'dist/index.js',
    cwd: '/var/www/your-app/api',
    instances: 'max',
    exec_mode: 'cluster',
    watch: false,
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    error_file: '/var/log/pm2/api-error.log',
    out_file: '/var/log/pm2/api-out.log',
    merge_logs: true,
    max_memory_restart: '512M',
  }],
};
```

```bash
pm2 start ecosystem.config.cjs --env production
pm2 reload your-app-api          # zero-downtime (cluster mode)
pm2 logs your-app-api --lines 100
pm2 startup && pm2 save               # persist across reboots
```

## Nginx Config

```nginx
# /etc/nginx/sites-available/your-app
server {
    listen 80;
    server_name api.yourapp.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourapp.com;

    ssl_certificate /etc/letsencrypt/live/api.yourapp.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourapp.com/privkey.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/your-app /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

## SSL with Certbot

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d api.yourapp.com
certbot renew --dry-run   # verify auto-renew
```

## Zero-Downtime Deploy Script

```bash
#!/bin/bash
# scripts/deploy.sh — runs on VPS
set -e

cd /var/www/your-app/api

echo "→ Pulling latest..."
git pull origin main

echo "→ Installing deps..."
npm ci --production=false

echo "→ Building..."
npm run build

echo "→ Migrating DB..."
npx prisma migrate deploy

echo "→ Reloading PM2..."
pm2 reload your-app-api --update-env

echo "✓ Done"
```

## GitHub Actions CI/CD

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Test
        run: npm ci && npm test
      - name: Deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: bash /var/www/your-app/api/scripts/deploy.sh
```

### Required GitHub Secrets

| Secret | Value |
|---|---|
| `VPS_HOST` | Hostinger VPS IP |
| `VPS_USER` | SSH user (e.g. `ubuntu`) |
| `VPS_SSH_KEY` | Private key (`ssh-keygen -t ed25519`) |

## Frontend (Static)

```bash
npm run build
rsync -avz --delete dist/ user@vps:/var/www/your-app/frontend/
```

```nginx
root /var/www/your-app/frontend;
index index.html;
try_files $uri $uri/ /index.html;   # SPA fallback
```

## Common Issues

| Symptom | Cause | Fix |
|---|---|---|
| 502 Bad Gateway | PM2 process down | `pm2 restart your-app-api` |
| App won't start | Missing env vars | Check `.env` file exists |
| OOM crash | Too many instances | Set `instances: 2` |
| Port in use | Stale process | `lsof -i :3001` → kill PID |
| Migration fails | DB connection | Confirm `DATABASE_URL` in deploy env |
