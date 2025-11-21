-- ============================================================================
-- Initial Schema Migration for Volunteer Management System
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- TABLES
-- ============================================================================

-- Users table (extends auth.users)
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ORGANISER', 'VOLUNTEER')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Events table
CREATE TABLE public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    admin_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_event_dates CHECK (end_date > start_date)
);

-- Tasks table
CREATE TABLE public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    duration INTEGER GENERATED ALWAYS AS (
        EXTRACT(EPOCH FROM (end_time - start_time)) / 60
    ) STORED, -- Duration in minutes, calculated automatically
    volunteers_needed INTEGER NOT NULL CHECK (volunteers_needed > 0),
    volunteers_assigned INTEGER NOT NULL DEFAULT 0 CHECK (volunteers_assigned >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_task_times CHECK (end_time > start_time),
    CONSTRAINT valid_volunteer_count CHECK (volunteers_assigned <= volunteers_needed)
);

-- Assignments table (many-to-many relationship between volunteers and tasks)
CREATE TABLE public.assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    volunteer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    assignment_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Ensure a volunteer can only be assigned to a task once
    CONSTRAINT unique_task_volunteer UNIQUE (task_id, volunteer_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index for faster lookups
CREATE INDEX idx_events_admin_id ON public.events(admin_id);
CREATE INDEX idx_tasks_event_id ON public.tasks(event_id);
CREATE INDEX idx_assignments_task_id ON public.assignments(task_id);
CREATE INDEX idx_assignments_volunteer_id ON public.assignments(volunteer_id);
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_role ON public.users(role);

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.events
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.users IS 'User profiles extending auth.users with role information';
COMMENT ON TABLE public.events IS 'Events created by organisers';
COMMENT ON TABLE public.tasks IS 'Tasks within events that volunteers can sign up for';
COMMENT ON TABLE public.assignments IS 'Volunteer assignments to tasks';
COMMENT ON COLUMN public.tasks.duration IS 'Calculated duration in minutes between start_time and end_time';
COMMENT ON COLUMN public.tasks.volunteers_assigned IS 'Current count of assigned volunteers (managed by triggers)';
