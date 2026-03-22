# @mckabue/react-use-async

> A lightweight React hook for managing async operations with loading states, error handling, and data merging.

[![npm version](https://img.shields.io/npm/v/@mckabue/react-use-async.svg)](https://www.npmjs.com/package/@mckabue/react-use-async)
[![npm downloads](https://img.shields.io/npm/dm/@mckabue/react-use-async.svg)](https://www.npmjs.com/package/@mckabue/react-use-async)
[![license](https://img.shields.io/npm/l/@mckabue/react-use-async.svg)](https://www.npmjs.com/package/@mckabue/react-use-async)

## Why This Hook?

Managing async state in React often means writing the same boilerplate: `isLoading`, `error`, `data`, `try/catch` — over and over. `@mckabue/react-use-async` encapsulates this pattern into a single, type-safe hook.

**What you get:**
- **Auto-execute on mount** (or opt out with `useDelayedAsync`)
- **Loading states** — `isExecuting`, `isContinuing`, `isLoading`
- **Error capture** — errors are caught and exposed, not swallowed; `clearError()` lets you dismiss them
- **Data merging** — `continueWith` supports pagination / incremental loading
- **Argument tracking** — `args` exposes the last-used arguments
- **Execution counting** — `executionCount` tracks how many times `execute()` has been called
- **Zero dependencies** (except React)
- **Full TypeScript generics** for type-safe data and arguments

## Installation

```bash
npm install @mckabue/react-use-async
# or
yarn add @mckabue/react-use-async
# or
pnpm add @mckabue/react-use-async
```

**Peer Dependencies:**
- `react`: ^18.0.0 || ^19.0.0

## Usage

### Basic — Execute on Mount

```tsx
import { useAsync } from '@mckabue/react-use-async';

function UserProfile({ userId }: { userId: string }) {
  const { data: user, isLoading, error } = useAsync(
    () => fetch(`/api/users/${userId}`).then(r => r.json()),
    [userId], // re-fetches when userId changes
  );

  if (isLoading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;
  return <div>{user.name}</div>;
}
```

### Delayed — Execute on Demand

```tsx
import { useDelayedAsync } from '@mckabue/react-use-async';

function DeleteButton({ userId }: { userId: string }) {
  const { execute, isLoading } = useDelayedAsync(
    async (id: string) => {
      await fetch(`/api/users/${id}`, { method: 'DELETE' });
    },
  );

  return (
    <button onClick={() => execute(userId)} disabled={isLoading}>
      {isLoading ? 'Deleting...' : 'Delete User'}
    </button>
  );
}
```

### Pagination — Continue With Merge

```tsx
import { useAsync } from '@mckabue/react-use-async';

function InfiniteList() {
  const { data, isLoading, isContinuing, continueWith } = useAsync(
    () => fetchPage(1),
  );

  const loadMore = continueWith(
    () => fetchPage(nextPage),
    (oldData, newData) => ({
      items: [...(oldData?.items ?? []), ...(newData?.items ?? [])],
      nextPage: newData?.nextPage,
    }),
  );

  return (
    <div>
      {data?.items.map(item => <Item key={item.id} {...item} />)}
      <button onClick={loadMore} disabled={isContinuing}>
        {isContinuing ? 'Loading...' : 'Load More'}
      </button>
    </div>
  );
}
```

## API Reference

### `useAsync(asyncCallback, dependencies?, executeOnMount?)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `asyncCallback` | `(...args: A) => Promise<R>` | — | The async function to execute |
| `dependencies` | `DependencyList` | `[]` | React dependency list (triggers re-execution) |
| `executeOnMount` | `boolean` | `true` | Whether to run on mount |

**Returns:** `AsyncResponseType<R, A>`

| Property | Type | Description |
|----------|------|-------------|
| `data` | `R \| null` | Resolved data |
| `isExecuting` | `boolean` | Primary execution in progress |
| `isContinuing` | `boolean` | Continuation in progress |
| `isLoading` | `boolean` | Any operation in progress |
| `args` | `A` | Arguments from last `execute()` call |
| `executionCount` | `number` | Number of times `execute()` has been called |
| `error` | `Error \| null` | Error from last operation |
| `clearError` | `() => void` | Clear the current error state |
| `execute` | `(...args: A) => Promise<void>` | Manually trigger the async callback |
| `continueWith` | `(cb, merger) => () => Promise<void>` | Continue with data merging |

### `useDelayedAsync(asyncCallback, dependencies?)`

Same as `useAsync` but with `executeOnMount` set to `false`. Perfect for user-triggered operations.

## TypeScript Support

Fully typed with generics:

```tsx
// Type-safe response and arguments
const { data, execute } = useAsync<User[], [string]>(
  async (query: string) => searchUsers(query),
  [],
  false,
);

// data is User[] | null
// execute accepts (query: string) => Promise<void>
```

## License

MIT © [Kabui Charles](https://github.com/mckabue)
