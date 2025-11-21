# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A volunteer task scheduling web application built for events. Organizers create events and tasks, while volunteers self-assign through an interactive calendar view. The application supports 50+ concurrent users with real-time updates.

## Tech Stack

- **Framework**: Next.js 15 with App Router, React 19, TypeScript
- **Styling**: Tailwind CSS 4
- **Backend**: Supabase (PostgreSQL, Auth, Realtime)
- **State Management**: Zustand
- **Date Handling**: date-fns

## Development Commands

```bash
npm run dev     # Start development server (http://localhost:3000)
npm run build   # Build for production
npm start       # Run production build
npm run lint    # Run ESLint
```

## Architecture

### Authentication Model

The app has **two distinct authentication patterns**:

1. **Organizers**: Full Supabase authentication with email/password
   - Protected routes via middleware (middleware.ts:34)
   - Session management through Supabase Auth
   - Profile created automatically on signup via database trigger

2. **Volunteers**: Anonymous sessions per event
   - No authentication required
   - Identified by unique name per event (stored in `volunteers` table)
   - Session stored in localStorage on client side
   - Can participate without creating an account

### Database Architecture

Six main tables with strategic relationships:

- `profiles` → Organizer accounts (1:1 with auth.users)
- `events` → Events created by organizers (belongs to profile)
- `task_types` → Categorized task types with colors (belongs to event)
- `tasks` → Individual tasks with datetime and volunteer requirements (belongs to event, optional task_type)
- `volunteers` → Anonymous volunteer sessions (unique name per event)
- `task_assignments` → Join table for volunteer-task relationships

**Key indexes** for performance:
- Event lookups by organizer_id
- Task queries by event_id and datetime range
- Assignment lookups by task_id and volunteer_id

### Real-time Updates

Supabase Realtime is used for instant synchronization:
- Task assignments (volunteers see others assign/unassign in real-time)
- Client components subscribe to relevant channels
- WebSocket-based subscriptions ensure sub-second latency

### Supabase Client Patterns

**Two separate client creation patterns** based on environment:

1. **Server Components**: Use `lib/supabase/server.ts`
   - Async function with cookies() from next/headers
   - Used in Server Components and Server Actions
   - Example: `const supabase = await createClient()`

2. **Client Components**: Use `lib/supabase/client.ts`
   - Synchronous browser client
   - Used in Client Components with 'use client' directive
   - Example: `const supabase = createClient()`

### Route Structure

```
app/
├── page.tsx                    # Public home page
├── login/                      # Organizer login
├── signup/                     # Organizer signup
├── dashboard/                  # Protected organizer dashboard
│   ├── page.tsx               # List of organizer's events
│   ├── events/[id]/
│   │   ├── page.tsx          # Event management (tasks, task types)
│   │   └── edit/page.tsx     # Edit event details
│   └── actions/               # Server Actions for mutations
└── events/[id]/
    └── page.tsx               # Public event view (volunteer calendar)
```

### Key Components

- **EventCalendar.tsx**: Interactive calendar grid
  - Days as columns, hours (24-hour) as rows
  - Handles task assignment/unassignment
  - Real-time subscription to task_assignments
  - Filtering by task type and assignment status

- **TaskManager.tsx**: CRUD for tasks (organizer view)
  - Create/edit/delete tasks
  - Set datetime, volunteer count, task type

- **TaskTypeManager.tsx**: Manage categorized task types with colors

### Row Level Security (RLS)

Supabase RLS policies enforce data access rules:
- Organizers can only modify their own events/tasks/task_types
- Anyone can view events, tasks, task_types (public access for volunteers)
- Anyone can create volunteers and task_assignments (for volunteer self-assignment)
- Volunteers and task_assignments are publicly readable/writable

### Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=         # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Supabase anon key (public)
```

### Type Definitions

TypeScript interfaces in `lib/types/database.ts` mirror database schema:
- Base types for each table
- Extended types with relations (e.g., TaskWithDetails includes task_type and assignments)
- Use these types for type safety with Supabase queries

### Calendar Date Handling

The EventCalendar component uses date-fns for date operations:
- Event start_date and end_date define calendar range (inclusive)
- Tasks have start_datetime and end_datetime (timestamp with timezone)
- Calendar grid shows 24-hour format (0-23) in rows
- Each cell represents a 1-hour time slot for a specific day

### Middleware Protection

`middleware.ts` protects organizer routes:
- Checks for authenticated user via Supabase session
- Redirects unauthenticated users to /login when accessing /dashboard/*
- Refreshes session cookies automatically

## Common Patterns

### Creating a new organizer mutation:
1. Add Server Action in `app/dashboard/actions/` directory
2. Use `await createClient()` from lib/supabase/server
3. Verify user is authenticated and owns the resource
4. Execute mutation with RLS enforcement

### Adding a volunteer feature:
1. Client component with 'use client' directive
2. Use `createClient()` from lib/supabase/client (synchronous)
3. Handle volunteer session from localStorage
4. Subscribe to realtime changes if needed

### Querying with relations:
Use Supabase's select with nested relations:
```typescript
const { data } = await supabase
  .from('tasks')
  .select('*, task_type(*), assignments:task_assignments(*)')
```

## Database Schema Location

The complete schema is in `supabase-schema.sql` with:
- Table definitions with constraints
- Indexes for performance
- RLS policies for security
- Database functions and triggers
