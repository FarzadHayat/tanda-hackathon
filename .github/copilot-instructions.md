# Copilot Instructions for Volunteer Task Scheduler

## Architecture Overview

This is a **volunteer task scheduling app** where organizers create events/tasks and volunteers self-assign via a calendar view. Two distinct user types exist:

- **Organizers**: Full Supabase authentication (email/password), access `/dashboard/*` routes
- **Volunteers**: Anonymous per-event sessions stored in localStorage, no login required

## Supabase Client Patterns (Critical)

**Server Components/Actions** — use async client with cookies:
```typescript
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()  // ASYNC
```

**Client Components** — use synchronous browser client:
```typescript
'use client'
import { createClient } from '@/lib/supabase/client'
const supabase = createClient()  // SYNC, no await
```

## Database Schema

Six tables with cascade deletes: `profiles` → `events` → `task_types`/`tasks`/`volunteers` → `task_assignments`

- Volunteers are unique by `(event_id, name)` — not global accounts
- Task assignments enforce `(task_id, volunteer_id)` uniqueness
- Tasks have `start_datetime`/`end_datetime` (timestamptz), events have `start_date`/`end_date` (date)

Types in `lib/types/database.ts` — use `TaskWithDetails` for tasks with nested relations.

## Query Pattern with Relations

```typescript
const { data } = await supabase
  .from('tasks')
  .select('*, task_type:task_types(*), task_assignments(id, volunteer:volunteers(*))')
  .eq('event_id', eventId)
```

## Real-time Subscriptions

`EventCalendar.tsx` demonstrates the pattern for live updates:
```typescript
supabase.channel('channel_name')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignments' }, handler)
  .subscribe()
```
Always clean up with `supabase.removeChannel()` in useEffect return.

## Route Structure

| Path | Purpose | Auth |
|------|---------|------|
| `/dashboard/*` | Organizer routes (protected via middleware) | Required |
| `/events/[id]` | Public volunteer calendar view | None |
| `/login`, `/signup` | Organizer auth | None |

## Key Components

- `EventCalendar.tsx` — Main volunteer interface with realtime sync, cursor sharing, task filtering
- `TaskManager.tsx` — Organizer CRUD for tasks
- `TaskTypeManager.tsx` — Task categories with colors

## Adding Organizer Features

1. Create Server Action in `app/dashboard/actions/` or add to `app/dashboard/actions.ts`
2. Use `await createClient()` from server
3. Verify ownership: `WHERE organizer_id = auth.uid()`
4. RLS policies auto-enforce access

## Adding Volunteer Features

1. Use `'use client'` directive
2. Get volunteer ID from localStorage: `localStorage.getItem(\`volunteer_\${event.id}\`)`
3. Use sync `createClient()` from client
4. Subscribe to realtime if live updates needed

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=        # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Public anon key
```

## Commands

```bash
pnpm run dev     # Development server
pnpm run build   # Production build (validates TypeScript)
pnpm run lint    # ESLint check
```

## Styling

Tailwind CSS 4 with custom gradients. Event/task colors derive from `task_types.color`. Use existing utility patterns from `globals.css`.
