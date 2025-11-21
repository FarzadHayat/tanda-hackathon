-- Create profiles table for organizers
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create events table
CREATE TABLE events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organizer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- Create task_types table
CREATE TABLE task_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT unique_task_type_per_event UNIQUE(event_id, name)
);

-- Create tasks table
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  task_type_id UUID REFERENCES task_types(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  volunteers_required INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT valid_datetime_range CHECK (end_datetime > start_datetime),
  CONSTRAINT positive_volunteers CHECK (volunteers_required > 0)
);

-- Create volunteers table (for anonymous volunteer sessions per event)
CREATE TABLE volunteers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT unique_volunteer_name_per_event UNIQUE(event_id, name)
);

-- Create task_assignments table
CREATE TABLE task_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  volunteer_id UUID REFERENCES volunteers(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT unique_volunteer_per_task UNIQUE(task_id, volunteer_id)
);

-- Create indexes for better query performance
CREATE INDEX idx_events_organizer ON events(organizer_id);
CREATE INDEX idx_tasks_event ON tasks(event_id);
CREATE INDEX idx_tasks_task_type ON tasks(task_type_id);
CREATE INDEX idx_tasks_datetime ON tasks(start_datetime, end_datetime);
CREATE INDEX idx_task_types_event ON task_types(event_id);
CREATE INDEX idx_volunteers_event ON volunteers(event_id);
CREATE INDEX idx_task_assignments_task ON task_assignments(task_id);
CREATE INDEX idx_task_assignments_volunteer ON task_assignments(volunteer_id);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for events
CREATE POLICY "Organizers can view their own events" ON events
  FOR SELECT USING (auth.uid() = organizer_id);

CREATE POLICY "Anyone can view events by ID (for public access)" ON events
  FOR SELECT USING (true);

CREATE POLICY "Organizers can create events" ON events
  FOR INSERT WITH CHECK (auth.uid() = organizer_id);

CREATE POLICY "Organizers can update their own events" ON events
  FOR UPDATE USING (auth.uid() = organizer_id);

CREATE POLICY "Organizers can delete their own events" ON events
  FOR DELETE USING (auth.uid() = organizer_id);

-- RLS Policies for task_types
CREATE POLICY "Anyone can view task types" ON task_types
  FOR SELECT USING (true);

CREATE POLICY "Organizers can create task types for their events" ON task_types
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid()
    )
  );

CREATE POLICY "Organizers can update task types for their events" ON task_types
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid()
    )
  );

CREATE POLICY "Organizers can delete task types for their events" ON task_types
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid()
    )
  );

-- RLS Policies for tasks
CREATE POLICY "Anyone can view tasks" ON tasks
  FOR SELECT USING (true);

CREATE POLICY "Organizers can create tasks for their events" ON tasks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid()
    )
  );

CREATE POLICY "Organizers can update tasks for their events" ON tasks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid()
    )
  );

CREATE POLICY "Organizers can delete tasks for their events" ON tasks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid()
    )
  );

-- RLS Policies for volunteers
CREATE POLICY "Anyone can view volunteers" ON volunteers
  FOR SELECT USING (true);

CREATE POLICY "Anyone can create volunteer sessions" ON volunteers
  FOR INSERT WITH CHECK (true);

-- RLS Policies for task_assignments
CREATE POLICY "Anyone can view task assignments" ON task_assignments
  FOR SELECT USING (true);

CREATE POLICY "Anyone can create task assignments" ON task_assignments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can delete task assignments" ON task_assignments
  FOR DELETE USING (true);

-- Function to automatically create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to get task assignment counts
CREATE OR REPLACE FUNCTION get_task_assignment_count(task_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM task_assignments WHERE task_id = task_uuid;
$$ LANGUAGE SQL STABLE;
