---
name: tanstack-query
description: TanStack Query (React Query v5) patterns — query key conventions, data fetching, mutations with optimistic updates, cache invalidation, infinite scroll, and prefetching. Use when building or modifying data fetching in your React frontend.
origin: custom
---

# TanStack Query (React Query v5)

Server-state management for your React frontend.

## When to Activate

- Fetching data from your API in React components
- Writing mutations (create, update, delete operations)
- Implementing optimistic updates for instant UI feedback
- Setting up infinite scroll or paginated lists
- Debugging stale data, cache misses, or refetch loops
- Reviewing components that mix server state with local useState

## Setup

```tsx
// main.jsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,        // 1 min — don't refetch if data is fresh
      retry: 1,
      refetchOnWindowFocus: false,  // disable for desktop SaaS feel
    },
  },
});

root.render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
```

## Query Key Conventions

Use arrays, coarse-to-fine. This enables precise invalidation.

```typescript
// lib/keys.js
export const keys = {
  exports: {
    all:    () => ['exports'],
    list:   (folderId) => ['exports', 'list', folderId],
    detail: (id) => ['exports', 'detail', id],
  },
  profiles: {
    all:    () => ['profiles'],
    list:   () => ['profiles', 'list'],
    detail: (id) => ['profiles', 'detail', id],
  },
  cart: {
    all:     () => ['cart'],
    current: () => ['cart', 'current'],
  },
  subscription: {
    all:    () => ['subscription'],
    status: () => ['subscription', 'status'],
  },
  orders: {
    all:  () => ['orders'],
    list: () => ['orders', 'list'],
  },
};
```

## Fetching Data

```jsx
import { useQuery } from '@tanstack/react-query';
import { keys } from '../lib/keys';

function useExports(folderId) {
  return useQuery({
    queryKey: keys.exports.list(folderId),
    queryFn: () => apiFetch(`/api/exports${folderId ? `?folder=${folderId}` : ''}`),
  });
}

function ExportList({ folderId }) {
  const { data, isPending, isError, error } = useExports(folderId);

  if (isPending) return <Spinner />;
  if (isError)   return <p>Error: {error.message}</p>;

  return <ul>{data.map(e => <li key={e.id}>{e.name}</li>)}</ul>;
}
```

## Mutations

```jsx
import { useMutation, useQueryClient } from '@tanstack/react-query';

function useSaveExport() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload) =>
      apiFetch('/api/exports', { method: 'POST', body: JSON.stringify(payload) }),

    onSuccess: () => {
      // Invalidate the whole exports list — triggers background refetch
      qc.invalidateQueries({ queryKey: keys.exports.all() });
    },
  });
}
```

## Optimistic Updates

Use for operations the user notices immediately (delete, rename, reorder).

```jsx
function useDeleteExport() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id) => apiFetch(`/api/exports/${id}`, { method: 'DELETE' }),

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: keys.exports.all() });
      const previous = qc.getQueryData(keys.exports.list());

      qc.setQueryData(keys.exports.list(), (old) =>
        old?.filter(e => e.id !== id) ?? []
      );

      return { previous };
    },

    onError: (_err, _id, ctx) => {
      qc.setQueryData(keys.exports.list(), ctx?.previous);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.exports.all() });
    },
  });
}
```

## Infinite Scroll / Pagination

```jsx
import { useInfiniteQuery } from '@tanstack/react-query';

function useInfiniteExports() {
  return useInfiniteQuery({
    queryKey: keys.exports.all(),
    queryFn: ({ pageParam = 1 }) =>
      apiFetch(`/api/exports?page=${pageParam}&limit=20`),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore ? pages.length + 1 : undefined,
  });
}

function ExportFeed() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteExports();
  const allExports = data?.pages.flatMap(p => p.items) ?? [];

  return (
    <>
      {allExports.map(e => <ExportCard key={e.id} export={e} />)}
      {hasNextPage && (
        <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}
```

## Prefetching

Prefetch on hover for near-instant navigation.

```jsx
const qc = useQueryClient();

function ExportLink({ id }) {
  return (
    <a
      href={`/exports/${id}`}
      onMouseEnter={() =>
        qc.prefetchQuery({
          queryKey: keys.exports.detail(id),
          queryFn: () => apiFetch(`/api/exports/${id}`),
          staleTime: 30_000,
        })
      }
    >
      View export
    </a>
  );
}
```

## Cache Invalidation Patterns

```javascript
// Invalidate everything under 'exports'
qc.invalidateQueries({ queryKey: keys.exports.all() });

// Invalidate just the list (not detail pages)
qc.invalidateQueries({ queryKey: keys.exports.list() });

// Update a single item in cache without refetch
qc.setQueryData(keys.exports.detail(id), updatedExport);

// Remove a query entirely (forces fresh fetch on next mount)
qc.removeQueries({ queryKey: keys.exports.detail(id) });
```

## Common Mistakes

- **Don't copy server state into `useState`** — derive from `useQuery` data directly
- **Don't share query keys between unrelated data** — causes unintended cache hits
- **`staleTime: 0` (default) refetches on every mount** — set a reasonable staleTime for stable data like subscription status
- **`invalidateQueries` is async** — don't `await` it unless you need to block on the refetch completing
- **Don't check both `data` and `isPending` with `data?.items ?? []`** — `data` is undefined when pending; check `isPending` first
