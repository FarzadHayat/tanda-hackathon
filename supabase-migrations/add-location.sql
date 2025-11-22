-- Add minimum and maximum volunteer hours to events table
-- Add a `location` column to `tasks` so tasks can include an address or venue
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS location VARCHAR(255);

-- Optional: document the new column
COMMENT ON COLUMN tasks.location IS 'Optional human-readable location/address for the task (up to 255 chars)';
