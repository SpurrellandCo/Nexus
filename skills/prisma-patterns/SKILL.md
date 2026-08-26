---
name: prisma-patterns
description: Prisma ORM patterns for schema design, migrations, type-safe queries, relations, and performance. Use when writing migrations, designing models, or building data-access layers with PostgreSQL, Express, and TypeScript.
origin: custom
---

# Prisma Patterns

Type-safe database access with Prisma for PostgreSQL. Covers schema design, migrations, query patterns, and performance.

## When to Activate

- Designing or modifying `schema.prisma` models
- Writing Prisma queries in API route handlers
- Creating or reviewing database migrations
- Optimizing slow queries (N+1, missing indexes)
- Handling transactions or upserts
- Seeding or resetting the database

## Schema Design

### Conventions

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  orders    Order[]
}

model Order {
  id        String      @id @default(cuid())
  userId    String
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  status    OrderStatus @default(PENDING)
  createdAt DateTime    @default(now())
}

enum OrderStatus {
  PENDING
  PAID
  SHIPPED
  CANCELLED
}
```

- Use `cuid()` for IDs (URL-safe, sortable, collision-resistant)
- Always include `createdAt` / `updatedAt` on every model
- Use `onDelete: Cascade` deliberately — document why if omitted
- Name relations explicitly with `@relation` for clarity
- Prefer enums over raw strings for bounded value sets

### Indexes

```prisma
model Design {
  id       String @id @default(cuid())
  userId   String
  slug     String
  status   String

  @@index([userId])            // FK index — always add for foreign keys
  @@index([status, createdAt]) // compound for filtered list queries
  @@unique([userId, slug])     // enforce business constraint at DB level
}
```

Add an index for every foreign key. Add compound indexes to match your most common `WHERE` + `ORDER BY` patterns.

## Migrations

```bash
# Create migration from schema diff
npx prisma migrate dev --name add_shipping_address

# Apply to production (no prompt)
npx prisma migrate deploy

# Reset dev DB and re-seed
npx prisma migrate reset

# Inspect current migration state
npx prisma migrate status
```

Never edit migration files after they've been applied to any environment. Create a new migration instead.

## Query Patterns

### Select Only What You Need

```typescript
// Good: explicit select
const user = await prisma.user.findUnique({
  where: { id },
  select: { id: true, email: true, name: true },
});

// Bad: fetches all columns including large blobs
const user = await prisma.user.findUnique({ where: { id } });
```

### Avoiding N+1 Queries

```typescript
// Bad: N+1 — one query per order
const users = await prisma.user.findMany();
for (const user of users) {
  const orders = await prisma.order.findMany({ where: { userId: user.id } });
}

// Good: single query with include
const users = await prisma.user.findMany({
  include: { orders: { select: { id: true, status: true } } },
});
```

### Upsert

```typescript
const design = await prisma.design.upsert({
  where: { userId_slug: { userId, slug } },
  update: { updatedAt: new Date(), modelUrl },
  create: { userId, slug, modelUrl },
});
```

### Transactions

```typescript
const [order, _inventory] = await prisma.$transaction([
  prisma.order.create({ data: orderData }),
  prisma.inventory.update({ where: { id: itemId }, data: { stock: { decrement: 1 } } }),
]);
```

For complex or conditional transactions, use interactive transactions:

```typescript
await prisma.$transaction(async (tx) => {
  const item = await tx.inventory.findUniqueOrThrow({ where: { id: itemId } });
  if (item.stock < 1) throw new Error('Out of stock');
  await tx.inventory.update({ where: { id: itemId }, data: { stock: { decrement: 1 } } });
  return tx.order.create({ data: orderData });
});
```

### Pagination

```typescript
// Cursor-based (preferred for large datasets)
const items = await prisma.design.findMany({
  take: 20,
  skip: cursor ? 1 : 0,
  cursor: cursor ? { id: cursor } : undefined,
  orderBy: { createdAt: 'desc' },
});

// Offset-based (fine for small datasets / admin tables)
const items = await prisma.design.findMany({
  take: pageSize,
  skip: page * pageSize,
  orderBy: { createdAt: 'desc' },
});
```

## Type Safety

Prisma generates types automatically. Use them:

```typescript
import { Prisma, Design } from '@prisma/client';

// Input types for create/update
type CreateDesignInput = Prisma.DesignCreateInput;

// Return type of a specific query (with select)
type DesignSummary = Prisma.DesignGetPayload<{
  select: { id: true; slug: true; userId: true }
}>;
```

## Singleton Client

```typescript
// lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

## Seeding

```typescript
// prisma/seed.ts
import { prisma } from '../lib/prisma';

async function main() {
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: { email: 'admin@example.com', name: 'Admin' },
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

```json
// package.json
"prisma": { "seed": "ts-node prisma/seed.ts" }
```

```bash
npx prisma db seed
```
