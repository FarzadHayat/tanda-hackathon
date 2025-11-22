'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Event, TaskType, Task, TaskAssignment, Volunteer } from '@/lib/types/database'
import { eachDayOfInterval, eachHourOfInterval, format, startOfDay, endOfDay, isWithinInterval } from 'date-fns'

interface ExtendedTask extends Task {
  task_type?: TaskType | null
  task_assignments?: Array<{
    id: string
    volunteer: Volunteer
  }>
}

interface EventCalendarProps {
  event: Event
  taskTypes: TaskType[]
  initialTasks: ExtendedTask[]
}

export default function EventCalendar({ event, taskTypes, initialTasks }: EventCalendarProps) {
  const [tasks, setTasks] = useState<ExtendedTask[]>(initialTasks)
  const [volunteerName, setVolunteerName] = useState<string>('')
  const [volunteerId, setVolunteerId] = useState<string | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [filterTaskType, setFilterTaskType] = useState<string>('all')
  const [filterVolunteer, setFilterVolunteer] = useState<string>('all')
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  // Load volunteer from localStorage
  useEffect(() => {
    const savedVolunteer = localStorage.getItem(`volunteer_${event.id}`)
    if (savedVolunteer) {
      const { id, name } = JSON.parse(savedVolunteer)
      setVolunteerId(id)
      setVolunteerName(name)
    }
  }, [event.id])

  // Set up real-time subscriptions
  useEffect(() => {
    const channel = supabase
      .channel(`event_${event.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_assignments',
          filter: `task_id=in.(${tasks.map(t => t.id).join(',')})`
        },
        () => {
          // Refresh tasks when assignments change
          refreshTasks()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [event.id, tasks, supabase])

  const refreshTasks = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        task_type:task_types(*),
        task_assignments(
          id,
          volunteer:volunteers(*)
        )
      `)
      .eq('event_id', event.id)
      .order('start_datetime')

    if (!error && data) {
      setTasks(data)
    }
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      if (!volunteerName.trim()) {
        throw new Error('Please enter your name')
      }

      // Create or get volunteer
      const { data, error } = await supabase
        .from('volunteers')
        .upsert({
          event_id: event.id,
          name: volunteerName.trim(),
        }, {
          onConflict: 'event_id,name',
          ignoreDuplicates: false
        })
        .select()
        .single()

      if (error) throw error

      setVolunteerId(data.id)
      localStorage.setItem(`volunteer_${event.id}`, JSON.stringify({ id: data.id, name: volunteerName.trim() }))
      setShowAuthModal(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const handleSignOut = () => {
    setVolunteerId(null)
    setVolunteerName('')
    localStorage.removeItem(`volunteer_${event.id}`)
  }

  const handleAssignTask = async (taskId: string) => {
    if (!volunteerId) {
      setShowAuthModal(true)
      return
    }

    setError(null)

    try {
      const task = tasks.find(t => t.id === taskId)
      if (!task) return

      // Check if already assigned
      const isAssigned = task.task_assignments?.some(
        a => a.volunteer.id === volunteerId
      )

      if (isAssigned) {
        throw new Error('You are already assigned to this task')
      }

      // Check if task is full
      const currentAssignments = task.task_assignments?.length || 0
      if (currentAssignments >= task.volunteers_required) {
        throw new Error('This task is already full')
      }

      const { error } = await supabase
        .from('task_assignments')
        .insert({
          task_id: taskId,
          volunteer_id: volunteerId,
        })

      if (error) throw error

      await refreshTasks()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const handleUnassignTask = async (taskId: string) => {
    if (!volunteerId) return

    setError(null)

    try {
      const task = tasks.find(t => t.id === taskId)
      if (!task) return

      const assignment = task.task_assignments?.find(
        a => a.volunteer.id === volunteerId
      )

      if (!assignment) return

      const { error } = await supabase
        .from('task_assignments')
        .delete()
        .eq('id', assignment.id)

      if (error) throw error

      await refreshTasks()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  // Calculate calendar structure
  const eventStart = new Date(event.start_date)
  const eventEnd = new Date(event.end_date)
  const days = eachDayOfInterval({ start: eventStart, end: eventEnd })

  // Get all hours (0-23)
  const hours = Array.from({ length: 24 }, (_, i) => i)

  // Filter tasks
  const filteredTasks = tasks.filter(task => {
    if (filterTaskType !== 'all' && task.task_type_id !== filterTaskType) {
      return false
    }

    if (filterVolunteer === 'unassigned') {
      return (task.task_assignments?.length || 0) < task.volunteers_required
    }

    if (filterVolunteer === 'mine' && volunteerId) {
      return task.task_assignments?.some(a => a.volunteer.id === volunteerId)
    }

    return true
  })

  // Group tasks by day and hour
  const getTasksForCell = (day: Date, hour: number) => {
    const cellStart = new Date(day)
    cellStart.setHours(hour, 0, 0, 0)
    const cellEnd = new Date(day)
    cellEnd.setHours(hour, 59, 59, 999)

    return filteredTasks.filter(task => {
      const taskStart = new Date(task.start_datetime)
      const taskEnd = new Date(task.end_datetime)

      // Task should only appear in this cell if it has actual time within this hour
      // A task ending exactly at the start of an hour (e.g., 10:00-11:00) should not appear in the 11:00 hour
      return (
        (taskStart >= cellStart && taskStart <= cellEnd) ||
        (taskEnd > cellStart && taskEnd <= cellEnd) ||
        (taskStart < cellStart && taskEnd > cellEnd)
      )
    })
  }

  // Get unique volunteers
  const allVolunteers = new Set<string>()
  tasks.forEach(task => {
    task.task_assignments?.forEach(a => {
      allVolunteers.add(JSON.stringify({ id: a.volunteer.id, name: a.volunteer.name }))
    })
  })
  const uniqueVolunteers = Array.from(allVolunteers).map(v => JSON.parse(v))

  return (
    <div>
      {/* Volunteer Auth Bar */}
      <div className="mb-6 bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {volunteerId ? (
              <>
                <span className="text-sm text-gray-700">
                  Signed in as: <strong>{volunteerName}</strong>
                </span>
                <button
                  onClick={handleSignOut}
                  className="text-sm text-orange-600 hover:text-orange-800"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-4 py-2 bg-linear-to-r from-orange-500 to-purple-600 text-white text-sm rounded-md hover:from-orange-600 hover:to-purple-700"
              >
                Sign In to Volunteer
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4">
            <select
              value={filterTaskType}
              onChange={(e) => setFilterTaskType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="all">All Task Types</option>
              {taskTypes.map((tt) => (
                <option key={tt.id} value={tt.id}>
                  {tt.name}
                </option>
              ))}
            </select>

            <select
              value={filterVolunteer}
              onChange={(e) => setFilterVolunteer(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="all">All Tasks</option>
              <option value="unassigned">Unassigned</option>
              {volunteerId && <option value="mine">My Tasks</option>}
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}
      </div>

      {/* Calendar View */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                  Time
                </th>
                {days.map((day) => (
                  <th
                    key={day.toISOString()}
                    className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px]"
                  >
                    {format(day, 'EEE, MMM d')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {hours.map((hour) => (
                <tr key={hour}>
                  <td className="sticky left-0 z-10 bg-white px-4 py-2 whitespace-nowrap text-sm text-gray-500 border-r border-gray-200">
                    {format(new Date().setHours(hour, 0, 0, 0), 'HH:mm')}
                  </td>
                  {days.map((day) => {
                    const cellTasks = getTasksForCell(day, hour)
                    return (
                      <td
                        key={`${day.toISOString()}-${hour}`}
                        className="px-2 py-2 align-top border-r border-gray-100 min-h-[80px]"
                      >
                        <div className="space-y-1">
                          {cellTasks.map((task) => {
                            const isAssigned = task.task_assignments?.some(
                              a => a.volunteer.id === volunteerId
                            )
                            const assignmentCount = task.task_assignments?.length || 0
                            const isFull = assignmentCount >= task.volunteers_required
                            const taskType = taskTypes.find(tt => tt.id === task.task_type_id)

                            return (
                              <div
                                key={task.id}
                                className="p-2 rounded text-xs border-l-4 cursor-pointer hover:shadow-md transition-shadow"
                                style={{
                                  borderLeftColor: taskType?.color || '#9CA3AF',
                                  backgroundColor: isAssigned ? '#DBEAFE' : isFull ? '#FEE2E2' : '#F9FAFB'
                                }}
                              >
                                <div className="font-medium text-gray-900 mb-1">
                                  {task.name}
                                </div>
                                <div className="text-gray-600 mb-1">
                                  {format(new Date(task.start_datetime), 'HH:mm')} -{' '}
                                  {format(new Date(task.end_datetime), 'HH:mm')}
                                </div>
                                <div className="text-gray-600 mb-1">
                                  {assignmentCount}/{task.volunteers_required} volunteers
                                </div>
                                {task.task_assignments && task.task_assignments.length > 0 && (
                                  <div className="text-gray-600 mb-2 text-xs">
                                    {task.task_assignments.map(a => a.volunteer.name).join(', ')}
                                  </div>
                                )}
                                {isAssigned ? (
                                  <button
                                    onClick={() => handleUnassignTask(task.id)}
                                    className="w-full px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                                  >
                                    Unassign
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleAssignTask(task.id)}
                                    disabled={isFull}
                                    className="w-full px-2 py-1 bg-linear-to-r from-orange-500 to-purple-600 text-white rounded text-xs hover:from-orange-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isFull ? 'Full' : 'Assign Me'}
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Enter Your Name
            </h3>
            <form onSubmit={handleAuth}>
              {error && (
                <div className="mb-4 rounded-md bg-red-50 p-4">
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              )}
              <input
                type="text"
                placeholder="Your name"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4 focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                value={volunteerName}
                onChange={(e) => setVolunteerName(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-linear-to-r from-orange-500 to-purple-600 text-white rounded-md hover:from-orange-600 hover:to-purple-700"
                >
                  Continue
                </button>
                <button
                  type="button"
                  onClick={() => setShowAuthModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
