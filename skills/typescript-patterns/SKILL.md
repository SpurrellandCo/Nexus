---
name: typescript-patterns
description: TypeScript patterns for type safety, generics, utility types, discriminated unions, type narrowing, Zod validation, and module organization. Use when writing TypeScript across the full stack (React + Express + Prisma).
origin: custom
---

# TypeScript Patterns

Idiomatic TypeScript for a full-stack React + Express + Prisma codebase.

## When to Activate

- Designing types for API request/response shapes
- Writing generic utilities or hooks
- Narrowing union types in conditional logic
- Typing async functions, Promises, and error paths
- Reviewing TypeScript for type safety regressions
- Fixing `any`, `unknown`, or assertion-heavy code

## Core Principles

- **No `any`** — use `unknown` for genuinely unknown values and narrow before use
- **Explicit return types on exported functions** — helps catch regressions early
- **Prefer type inference for local variables** — don't annotate what TypeScript can derive
- **Discriminated unions over boolean flags** — model state as a union, not a bag of nullable fields

## Utility Types

```typescript
type UserPreview = Pick<User, 'id' | 'name' | 'avatarUrl'>;
type CreateUserInput = Omit<User, 'id' | 'createdAt' | 'updatedAt'>;
type UpdateUserInput = Partial<CreateUserInput>;
type StatusMap = Record<OrderStatus, string>;
```

## Discriminated Unions

Model mutually exclusive states — never boolean flags:

```typescript
// Bad: impossible states representable
type AsyncState<T> = { loading: boolean; data: T | null; error: Error | null };

// Good: only valid states exist
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

function renderState<T>(state: AsyncState<T>) {
  switch (state.status) {
    case 'idle':    return null;
    case 'loading': return <Spinner />;
    case 'success': return <Data value={state.data} />;
    case 'error':   return <ErrorBanner error={state.error} />;
  }
}
```

## Type Narrowing

```typescript
// typeof
function format(value: string | number) {
  if (typeof value === 'string') return value.trim();
  return value.toFixed(2);
}

// instanceof
function handleError(e: unknown) {
  if (e instanceof Error) return e.message;
  return String(e);
}

// Type guard
function isUser(value: unknown): value is User {
  return typeof value === 'object' && value !== null && 'id' in value && 'email' in value;
}

// Assertion (throws if invalid)
function assertDefined<T>(value: T | null | undefined, label: string): asserts value is T {
  if (value == null) throw new Error(`${label} is required`);
}
```

## Generics

```typescript
// Generic API response envelope
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function apiFetch<T>(url: string): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, data: await res.json() as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// Constrained generic
function pluck<T, K extends keyof T>(items: T[], key: K): T[K][] {
  return items.map((item) => item[key]);
}
```

## Typed Express Routes

```typescript
import { Request, Response, NextFunction } from 'express';

interface CreateOrderBody {
  items: Array<{ productId: string; quantity: number }>;
}

app.post('/orders', async (
  req: Request<{}, {}, CreateOrderBody>,
  res: Response,
  next: NextFunction
) => {
  const { items } = req.body; // fully typed
});

app.get('/orders/:id', async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
});
```

## Zod for Runtime Validation

```typescript
import { z } from 'zod';

const CreateOrderSchema = z.object({
  items: z.array(z.object({
    productId: z.string().cuid(),
    quantity: z.number().int().positive(),
  })).min(1),
});

type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

// Validate at API boundary
const result = CreateOrderSchema.safeParse(req.body);
if (!result.success) {
  return res.status(400).json({ error: result.error.flatten() });
}
const input = result.data; // fully typed
```

## Avoiding Common Pitfalls

```typescript
// Don't: non-null assertion hides bugs
const user = users.find(u => u.id === id)!;

// Do: handle the missing case
const user = users.find(u => u.id === id);
if (!user) throw new NotFoundError(`User ${id}`);

// Don't: type assertion for lazy typing
const data = response as SomeType;

// Do: validate at runtime
const data = SomeSchema.parse(response);

// Don't: enum (generates runtime code, has pitfalls)
enum Direction { Up, Down }

// Do: const object + type union
const Direction = { Up: 'Up', Down: 'Down' } as const;
type Direction = typeof Direction[keyof typeof Direction];
```
