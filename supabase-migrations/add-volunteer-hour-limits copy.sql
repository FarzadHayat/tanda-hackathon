-- Add minimum and maximum volunteer hours to events table
ALTER TABLE events
ADD COLUMN min_volunteer_hours DECIMAL(5,2) DEFAULT 0,
ADD COLUMN max_volunteer_hours DECIMAL(5,2),
ADD CONSTRAINT valid_hour_limits CHECK (
  (max_volunteer_hours IS NULL) OR
  (min_volunteer_hours <= max_volunteer_hours)
);

-- Add comments for documentation
COMMENT ON COLUMN events.min_volunteer_hours IS 'Minimum hours goal for each volunteer (soft limit)';
COMMENT ON COLUMN events.max_volunteer_hours IS 'Maximum hours allowed per volunteer (hard limit)';
