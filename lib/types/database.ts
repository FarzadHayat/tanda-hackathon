export interface Profile {
  id: string
  email: string
  full_name: string | null
  created_at: string
  updated_at: string
}

export interface Event {
  id: string
  organizer_id: string
  name: string
  description: string | null
  start_date: string
  end_date: string
  min_volunteer_hours: number
  max_volunteer_hours: number | null
  created_at: string
  updated_at: string
}

export interface TaskType {
  id: string
  event_id: string
  name: string
  color: string
  created_at: string
}

export interface Task {
  id: string
  event_id: string
  task_type_id: string | null
  name: string
  description: string | null
  start_datetime: string
  end_datetime: string
  volunteers_required: number
  // optional textual location (address/venue) and optional coordinates
  location?: string | null
  latitude?: number | null
  longitude?: number | null
  created_at: string
  updated_at: string
}

export interface Volunteer {
  id: string
  event_id: string
  name: string
  created_at: string
}

export interface TaskAssignment {
  id: string
  task_id: string
  volunteer_id: string
  created_at: string
}

// Extended types with relations
export interface TaskWithDetails extends Task {
  task_type?: TaskType | null
  // PostgREST returns nested relations under the relationship name; some queries use `task_assignments`
  task_assignments?: TaskAssignmentWithDetails[]
  // keep alias for older code
  assignments?: TaskAssignmentWithDetails[]
  assignment_count?: number
}

export interface TaskAssignmentWithDetails extends TaskAssignment {
  volunteer?: Volunteer
  task?: Task
}
