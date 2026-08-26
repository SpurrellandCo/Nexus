---
name: stripe-integration
description: Stripe integration patterns for products, pricing, checkout sessions, webhooks, customer portal, and billing management. Covers secure server-side patterns and React frontend integration. Use when building payment flows, subscription billing, or order processing.
origin: custom
---

# Stripe Integration

Secure, idiomatic Stripe integration for SaaS billing and e-commerce. Covers products, checkout, webhooks, and the customer portal.

## When to Activate

- Building or modifying checkout flows
- Setting up or debugging webhooks
- Managing subscription states in the database
- Implementing the customer portal
- Handling Stripe events (payment success, failed charge, subscription cancelled)
- Syncing Stripe data with local database

## Core Principles

- **Never trust client-side data for prices.** Always look up the price from Stripe or your DB on the server.
- **Webhooks are the source of truth** for subscription state — not redirect URLs.
- **Idempotency keys** on all mutation requests to handle retries safely.
- Store `stripeCustomerId` and `stripeSubscriptionId` on your user/org model.

## Setup

```bash
npm install stripe @stripe/stripe-js
```

```typescript
// lib/stripe.ts — server-side client (singleton)
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
});
```

## Checkout Session

```typescript
// POST /api/checkout
export async function createCheckoutSession(userId: string, priceId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',          // or 'payment' for one-time
    customer_email: user.email,
    client_reference_id: userId,   // used in webhook to link session to user
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL}/pricing`,
    metadata: { userId },
  });

  return session.url;
}
```

## Webhooks

Webhooks are the only reliable signal for payment events. Never rely solely on redirect URL success params.

```typescript
// api/webhooks/stripe.ts
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import type Stripe from 'stripe';

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutComplete(session);
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscription(sub);
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await handlePaymentFailed(invoice);
      break;
    }
  }

  return new Response('ok');
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId ?? session.client_reference_id;
  if (!userId) return;

  await prisma.user.update({
    where: { id: userId },
    data: {
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: session.subscription as string,
      subscriptionStatus: 'active',
    },
  });
}

async function syncSubscription(sub: Stripe.Subscription) {
  await prisma.user.updateMany({
    where: { stripeSubscriptionId: sub.id },
    data: { subscriptionStatus: sub.status },
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  if (!invoice.customer) return;
  await prisma.user.updateMany({
    where: { stripeCustomerId: invoice.customer as string },
    data: { subscriptionStatus: 'past_due' },
  });
}
```

### Local Webhook Testing

```bash
stripe listen --forward-to localhost:3001/api/webhooks/stripe
```

## Customer Portal

```typescript
// POST /api/portal
export async function createPortalSession(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId!,
    return_url: `${process.env.APP_URL}/dashboard`,
  });

  return session.url;
}
```

## Database Schema (Prisma)

```prisma
model User {
  // ... existing fields
  stripeCustomerId     String?  @unique
  stripeSubscriptionId String?  @unique
  subscriptionStatus   String   @default("inactive")
  subscriptionPlan     String?
  currentPeriodEnd     DateTime?
}
```

## Environment Variables

```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Use `sk_test_` / `pk_test_` in development. Never commit live keys.

## Common Mistakes

- **Reading price from client body** — always look up price ID from your DB or env
- **Relying on redirect success URL** — use webhooks for subscription activation
- **Not handling `customer.subscription.updated`** — plan changes and renewals fire here
- **Missing idempotency keys on retries** — add `{ idempotencyKey: requestId }` to creation calls
- **Webhook secret mismatch** — use `stripe listen` output's secret in dev, not the dashboard secret
