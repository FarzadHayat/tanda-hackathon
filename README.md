# What am I Doing?

A web application for organizing and managing volunteer tasks for events. Organizers can create events and tasks, while volunteers can self-assign to tasks through an interactive calendar view.

## Features

### For Organizers
- Secure signup/login authentication
- Create and manage events (name, description, start date, end date)
- Create task types with custom colors
- Create tasks with:
  - Name and description
  - Start and end datetime
  - Number of volunteers required
  - Task type assignment
- Share event link with volunteers
- Dashboard to manage all events

### For Volunteers
- Simple authentication using unique name (no account required)
- View events in an interactive calendar view
  - Days as columns
  - Hours as rows (24-hour format)
  - Tasks displayed in appropriate time slots
- Self-assign to tasks
- Unassign from tasks
- Filter tasks by:
  - Task type
  - Status (all, unassigned, my tasks)
- Real-time updates when other volunteers assign/unassign

## Tech Stack

- **Frontend**: Next.js 15 with App Router, React, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Authentication, Real-time subscriptions)
- **Date Handling**: date-fns

## Setup Instructions

### 1. Clone the repository

```bash
cd /path/to/tanda-hackathon-2
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to the SQL Editor and run the schema from `supabase-schema.sql`
3. Get your project URL and anon key from Project Settings > API

### 4. Configure environment variables

The `.env.local` file already contains your Supabase credentials:
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anon key

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage Guide

### For Organizers

1. **Sign Up**: Go to the home page and click "Create Account"
2. **Create an Event**:
   - Go to your dashboard
   - Click "Create Event"
   - Fill in event details (name, description, start date, end date)
3. **Add Task Types**:
   - Open your event
   - In the "Task Types" section, add types (e.g., "Registration", "Setup", "Cleanup")
   - Choose a color for each type
4. **Create Tasks**:
   - Click "Add Task" in the "Tasks" section
   - Fill in task details including start/end time and number of volunteers needed
   - Assign a task type if desired
5. **Share Event**:
   - Copy the event link from the event page
   - Share it with volunteers

### For Volunteers

1. **Open Event Link**: Click on the link shared by the organizer
2. **Sign In**: Click "Sign In to Volunteer" and enter your name
3. **View Calendar**: Browse tasks organized by day (columns) and hour (rows)
4. **Filter Tasks**: Use the dropdown filters to:
   - Filter by task type
   - View only unassigned tasks
   - View only your assigned tasks
5. **Assign to Task**: Click "Assign Me" on any available task
6. **Unassign from Task**: Click "Unassign" on tasks you're assigned to

## Database Schema

The application uses the following tables:

- **profiles**: Organizer accounts
- **events**: Events created by organizers
- **task_types**: Categories for tasks with colors
- **tasks**: Individual tasks within events
- **volunteers**: Volunteer sessions (unique names per event)
- **task_assignments**: Assignments of volunteers to tasks

## Performance Optimization

The application is optimized to handle 50+ concurrent users through:

1. **Database Indexes**: Strategic indexes on frequently queried columns
2. **Row Level Security**: Supabase RLS policies for secure data access
3. **Real-time Subscriptions**: WebSocket-based updates for instant synchronization
4. **Efficient Queries**: Optimized database queries with proper filtering
5. **Client-side Caching**: LocalStorage for volunteer sessions

## Security Features

- Secure organizer authentication via Supabase Auth
- Row Level Security (RLS) policies to protect data
- Input validation on all forms
- Safe volunteer name handling (unique per event)
- Protection against SQL injection and XSS

## Development

### Project Structure

```
├── app/
│   ├── dashboard/          # Organizer dashboard
│   ├── events/[id]/        # Public event pages
│   ├── login/              # Login page
│   ├── signup/             # Signup page
│   └── page.tsx            # Home page
├── components/
│   ├── EventCalendar.tsx   # Calendar view component
│   ├── TaskManager.tsx     # Task management component
│   └── TaskTypeManager.tsx # Task type management component
├── lib/
│   ├── supabase/           # Supabase client utilities
│   └── types/              # TypeScript type definitions
└── supabase-schema.sql     # Database schema
```

### Scripts

- `npm run dev`: Start development server
- `npm run build`: Build for production
- `npm run start`: Start production server
- `npm run lint`: Run ESLint

## License

MIT
