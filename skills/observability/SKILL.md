---
name: observability
description: Production observability patterns for your Express API — structured JSON logging, log levels, PM2 log rotation, Sentry error tracking, health check endpoints, and request logging middleware. Use when adding logging, setting up error monitoring, or debugging production issues on a VPS.
origin: custom
---

# Observability

Structured logging, error tracking, and health checks for your Express API in production.

## When to Activate

- Adding logging to a new route, service, or background job
- Setting up Sentry error tracking
- Debugging a production error with no useful context
- Reviewing an endpoint that swallows errors silently
- Writing or modifying the `/api/health` endpoint
- Configuring PM2 log rotation on the VPS

## Structured JSON Logging

Use structured logs — not `console.log('user logged in')`. Every log line should be parseable.

```typescript
// lib/logger.ts
type Level = 'debug' | 'info' | 'warn' | 'error';

function log(level: Level, message: string, meta?: Record<string, unknown>) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    env: process.env.NODE_ENV,
    ...meta,
  };
  if (process.env.NODE_ENV !== 'test') {
    console[level === 'debug' ? 'log' : level](JSON.stringify(entry));
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => log('info',  msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => log('warn',  msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
};
```

```typescript
// Usage examples
logger.info('User registered', { userId: user.id, method: 'google' });
logger.warn('Rate limit hit', { ip: req.ip, path: req.path });
logger.error('Stripe webhook failed', { event: evt.type, error: err.message });
```

## Request Logging Middleware

```typescript
// middleware/requestLogger.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('HTTP', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
      ip: req.ip,
    });
  });
  next();
}
```

Mount early in `app.ts`, before routes.

## Error Tracking with Sentry

```bash
npm install @sentry/node
```

```typescript
// app.ts — init before any other imports
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,   // 10% of requests for performance traces
});
```

```typescript
// Global error handler — mount LAST in app.ts after all routes
import * as Sentry from '@sentry/node';

app.use(Sentry.expressErrorHandler());

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });
  res.status(500).json({ error: 'Internal server error' });
});
```

Capture errors with context manually when you need to attach user or order info:

```typescript
try {
  await processOrder(orderId);
} catch (err) {
  Sentry.withScope((scope) => {
    scope.setTag('orderId', orderId);
    scope.setUser({ id: userId });
    Sentry.captureException(err);
  });
  throw err;  // still propagate — don't swallow
}
```

## Health Check Endpoint

```typescript
// routes/health.routes.ts
import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

router.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'disconnected' });
  }
});

export default router;
```

Ping `/api/health` every 60s from an uptime monitor (UptimeRobot, Better Uptime, or Nginx upstream check).

## PM2 Log Rotation

```bash
# Run once on VPS after PM2 is set up
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7          # keep 7 days
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'   # rotate at midnight
```

Log files land at `/var/log/pm2/` as configured in `ecosystem.config.cjs`.

## Log Level Guide

| Level | Use for |
|---|---|
| `debug` | Verbose tracing — disable in prod via `LOG_LEVEL=info` |
| `info` | Normal lifecycle: user registered, order placed, webhook received |
| `warn` | Expected-but-notable: rate limit hit, retry attempt, deprecated usage |
| `error` | Unexpected failures requiring investigation: DB error, payment failure, uncaught exception |

Always include `userId` or `orderId` in error logs — makes production debugging possible without cold DB queries.

## Environment Variables

```bash
SENTRY_DSN=https://xxx@o0.ingest.sentry.io/yyy
LOG_LEVEL=info     # debug | info | warn | error
```

## Production Debugging Workflow

1. `pm2 logs your-app-api --lines 200` — tail recent output
2. Search Sentry for the error fingerprint or time window
3. Cross-reference `userId` / `orderId` from logs with the DB
4. If Sentry has no event, the error was swallowed — find the silent `catch` and add `logger.error` + `Sentry.captureException`
