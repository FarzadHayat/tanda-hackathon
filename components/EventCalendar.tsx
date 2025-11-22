'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Event, TaskType, Task, TaskAssignment, Volunteer } from '@/lib/types/database'
import { eachDayOfInterval, eachHourOfInterval, format, startOfDay, endOfDay, isWithinInterval, addDays } from 'date-fns'

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
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'agenda'>('day')
  const [currentDate, setCurrentDate] = useState<Date>(startOfDay(new Date()))
  const [volunteerName, setVolunteerName] = useState<string>('')
  const [volunteerId, setVolunteerId] = useState<string | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showErrorModal, setShowErrorModal] = useState(false)
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [filterTaskType, setFilterTaskType] = useState<string>('all')
  const [filterVolunteer, setFilterVolunteer] = useState<string>('all')
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()
  const bcRef = useRef<BroadcastChannel | null>(null)
  const broadChannelRef = useRef<any | null>(null)
  const filteredChannelRef = useRef<any | null>(null)
  const tasksRef = useRef<ExtendedTask[]>(initialTasks)
  const lastRealtimeRef = useRef<number>(0)
  const pollRef = useRef<number | null>(null)

  // Load volunteer from localStorage
  useEffect(() => {
    const savedVolunteer = localStorage.getItem(`volunteer_${event.id}`)
    if (savedVolunteer) {
      const { id, name } = JSON.parse(savedVolunteer)
      setVolunteerId(id)
      setVolunteerName(name)
    }
  }, [event.id])

  // Broad subscription: fallback subscription that listens for any changes
  // on task_assignments and refreshes state when the changed record belongs
  // to this event. We keep a ref to the channel so it's created once and
  // cleaned up on unmount.
  // Persistent broad subscription (created once) to catch any assignment
  // changes and attempt to refresh when relevant. Cleaned up on unmount.
  useEffect(() => {
    const setup = () => {
      if (broadChannelRef.current) return
      broadChannelRef.current = supabase
        .channel(`event_task_assignments_${event.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'task_assignments' },
          (payload: any) => {
            lastRealtimeRef.current = Date.now()
            try {
              const p: any = payload
              const changedTaskId = p.record?.task_id ?? p.new?.task_id ?? p.old?.task_id
              const hasTask = tasksRef.current?.some(t => t.id === changedTaskId)
              if (hasTask || !changedTaskId) {
                refreshTasks()
                refreshVolunteers()
                try { bcRef.current?.postMessage('refresh') } catch (e) {}
              }
            } catch (e) {
              // defensive: ignore payload parsing errors
            }
          }
        )
        .subscribe()
    }

    setup()

    return () => {
      try {
        if (broadChannelRef.current) {
          supabase.removeChannel(broadChannelRef.current)
          broadChannelRef.current = null
        }
      } catch (e) {}
    }
  }, [supabase, event.id])

  // Filtered subscription that listens only to task_assignments for the
  // tasks currently displayed. This subscription is recreated whenever the
  // tasks list (ids) changes.
  useEffect(() => {
    // keep a stable ref of tasks for handlers
    tasksRef.current = tasks

    // build comma-separated ids for the filter
    const idsArr = tasks.map(t => t.id).filter(Boolean)
    const ids = idsArr.join(',')

    // remove previous filtered channel if exists
    try {
      if (filteredChannelRef.current) {
        supabase.removeChannel(filteredChannelRef.current)
        filteredChannelRef.current = null
      }
    } catch (e) {}

    if (idsArr.length === 0) return

    filteredChannelRef.current = supabase
      .channel(`event_task_assignments_filtered_${event.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_assignments', filter: `task_id=in.(${ids})` },
        (payload: any) => {
          lastRealtimeRef.current = Date.now()
          refreshTasks()
          refreshVolunteers()
          try { bcRef.current?.postMessage('refresh') } catch (e) {}
        }
      )
      .subscribe()

    return () => {
      try {
        if (filteredChannelRef.current) {
          supabase.removeChannel(filteredChannelRef.current)
          filteredChannelRef.current = null
        }
      } catch (e) {}
    }
  }, [JSON.stringify(tasks.map(t => t.id || '')), supabase, event.id])

  // Subscribe to volunteers for live updates
  useEffect(() => {
    // initial load
    refreshVolunteers()

    const vChannel = supabase
      .channel(`event_volunteers_${event.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'volunteers', filter: `event_id=eq.${event.id}` },
        () => {
          refreshVolunteers()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(vChannel)
    }
  }, [event.id, supabase])

  // BroadcastChannel to notify other tabs in the same browser to refresh
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      bcRef.current = new BroadcastChannel(`tanda_event_${event.id}`)
      bcRef.current.onmessage = (ev) => {
        if (ev.data === 'refresh') {
          refreshTasks()
          refreshVolunteers()
        }
      }
    } catch (err) {
      // BroadcastChannel might not be available in some environments
      bcRef.current = null
    }

    return () => {
      try { bcRef.current?.close() } catch (e) {}
      bcRef.current = null
    }
  }, [event.id])

  // Polling fallback: if we haven't received realtime events recently,
  // poll periodically to ensure updates propagate.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const POLL_INTERVAL = 5_000 // 20s
    const QUIET_THRESHOLD = 30_000 // 30s without realtime

    const startPoll = () => {
      if (pollRef.current != null) return
      pollRef.current = window.setInterval(async () => {
        try {
          await refreshTasks()
          await refreshVolunteers()
          lastRealtimeRef.current = Date.now()
        } catch (e) {
          // ignore
        }
      }, POLL_INTERVAL) as unknown as number
    }

    const stopPoll = () => {
      if (pollRef.current != null) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }

    // watcher checks if realtime has been quiet and starts/stops poll
    const watcher = window.setInterval(() => {
      const last = lastRealtimeRef.current || 0
      const now = Date.now()
      if (now - last > QUIET_THRESHOLD) {
        startPoll()
      } else {
        stopPoll()
      }
    }, 2000)

    // initial check
    if (Date.now() - (lastRealtimeRef.current || 0) > QUIET_THRESHOLD) startPoll()

    return () => {
      clearInterval(watcher)
      stopPoll()
    }
  }, [])

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

  const refreshVolunteers = async () => {
    try {
      const { data } = await supabase
        .from('volunteers')
        .select('*')
        .eq('event_id', event.id)
        .order('name', { ascending: true })

      if (data) setVolunteers(data)
    } catch (err) {
      // ignore
    }
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      if (!volunteerName.trim()) {
        throw new Error('Please enter your name')
      }

      // First, check if volunteer already exists
      const { data: existingVolunteer } = await supabase
        .from('volunteers')
        .select('*')
        .eq('event_id', event.id)
        .eq('name', volunteerName.trim())
        .maybeSingle()

      let volunteerId: string

      if (existingVolunteer) {
        // Use existing volunteer
        volunteerId = existingVolunteer.id
      } else {
        // Create new volunteer
        const { data: newVolunteer, error } = await supabase
          .from('volunteers')
          .insert({
            event_id: event.id,
            name: volunteerName.trim(),
          })
          .select()
          .single()

        if (error) throw error
        volunteerId = newVolunteer.id
      }

      setVolunteerId(volunteerId)
      localStorage.setItem(`volunteer_${event.id}`, JSON.stringify({ id: volunteerId, name: volunteerName.trim() }))
      // Ensure volunteers list updates immediately for this client
      try {
        await refreshVolunteers()
      } catch (e) {
        // ignore
      }
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

  // Calculate volunteer's total hours
  const calculateVolunteerHours = () => {
    if (!volunteerId) return 0

    let totalHours = 0
    tasks.forEach(task => {
      const isAssigned = task.task_assignments?.some(
        a => a.volunteer.id === volunteerId
      )
      if (isAssigned) {
        const start = new Date(task.start_datetime)
        const end = new Date(task.end_datetime)
        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
        totalHours += hours
      }
    })

    return totalHours
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

      // Check maximum hours limit
      if (event.max_volunteer_hours) {
        const currentHours = calculateVolunteerHours()
        const taskStart = new Date(task.start_datetime)
        const taskEnd = new Date(task.end_datetime)
        const taskHours = (taskEnd.getTime() - taskStart.getTime()) / (1000 * 60 * 60)
        const totalHoursAfter = currentHours + taskHours

        if (totalHoursAfter > event.max_volunteer_hours) {
          setError(`Adding this task would exceed your maximum hour limit of ${event.max_volunteer_hours}h (current: ${currentHours.toFixed(1)}h, task: ${taskHours.toFixed(1)}h)`)
          setShowErrorModal(true)
          return
        }
      }

      const { error } = await supabase
        .from('task_assignments')
        .insert({
          task_id: taskId,
          volunteer_id: volunteerId,
        })

      if (error) throw error

      // locally refresh and notify other tabs/clients
      await refreshTasks()
      try {
        await refreshVolunteers()
      } catch {}
      try { bcRef.current?.postMessage('refresh') } catch (e) {}
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

      // locally refresh and notify other tabs/clients
      await refreshTasks()
      try {
        await refreshVolunteers()
      } catch {}
      try { bcRef.current?.postMessage('refresh') } catch (e) {}
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  // Calculate calendar structure (7-day weekly view starting at event start)
  const eventStart = startOfDay(new Date(event.start_date))
  const weekEnd = addDays(eventStart, 6)
  const days = eachDayOfInterval({ start: eventStart, end: weekEnd })

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

  // Helper: compute tasks/items for a given day with grouping and overlap column assignment
  type DayItem = {
    id: string
    start: Date
    end: Date
    tasks: ExtendedTask[]
    volunteers_required: number
    assignment_count: number
    task_type?: TaskType | null
  }

  const getDayItems = (day: Date): DayItem[] => {
    const dayStart = new Date(day)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(day)
    dayEnd.setHours(23, 59, 59, 999)

    // tasks that intersect this day
    const dayTasks = filteredTasks.filter(task => {
      const taskStart = new Date(task.start_datetime)
      const taskEnd = new Date(task.end_datetime)
      return taskStart <= dayEnd && taskEnd >= dayStart
    })

    // groupKey: prefer explicit `group_id` if present, fall back to name
    const groups = new Map<string, ExtendedTask[]>()
    dayTasks.forEach(t => {
      // @ts-ignore - some datasets may include a `group_id`
      const groupKey = (t as any).group_id || t.name || t.id
      if (!groups.has(groupKey)) groups.set(groupKey, [])
      groups.get(groupKey)!.push(t)
    })

    const items: DayItem[] = []
    groups.forEach((groupTasks, key) => {
      // compute merged span inside this day
      const start = new Date(Math.min(...groupTasks.map(t => new Date(t.start_datetime).getTime())))
      const end = new Date(Math.max(...groupTasks.map(t => new Date(t.end_datetime).getTime())))
      const volunteers_required = groupTasks.reduce((s, t) => s + (t.volunteers_required || 0), 0)
      const assignment_count = groupTasks.reduce((s, t) => s + ((t.task_assignments?.length) || 0), 0)
      const task_type = taskTypes.find(tt => tt.id === groupTasks[0].task_type_id) || null

      // clip to day bounds
      const clippedStart = start < dayStart ? dayStart : start
      const clippedEnd = end > dayEnd ? dayEnd : end

      items.push({ id: key, start: clippedStart, end: clippedEnd, tasks: groupTasks, volunteers_required, assignment_count, task_type })
    })

    // Assign columns to avoid overlaps using interval partitioning
    // Sort by start time
    items.sort((a, b) => a.start.getTime() - b.start.getTime())

    // columns: array of end times
    const columns: number[] = []
    const positioned: DayItem[] & { _col?: number; _cols?: number }[] = []

    items.forEach(item => {
      const s = item.start.getTime()
      const e = item.end.getTime()
      // find first column that is free
      let placed = false
      for (let ci = 0; ci < columns.length; ci++) {
        if (columns[ci] <= s) {
          // place here
          columns[ci] = e
          ;(item as any)._col = ci
          placed = true
          break
        }
      }

      if (!placed) {
        columns.push(e)
        ;(item as any)._col = columns.length - 1
      }

      positioned.push(item as any)
    })

    // annotate total columns count
    positioned.forEach(p => (p as any)._cols = columns.length)

    return positioned as DayItem[]
  }

  // Generate a simple gradient based on the event name so each event has a themed header
  const getGradientForEvent = (name: string) => {
    const palettes: Array<[string, string]> = [
      ['#FFA07A', '#FF7F50'],
      ['#FFDEE9', '#B5FFFC'],
      ['#FBD786', '#f7797d'],
      ['#A18CD1', '#FBC2EB'],
      ['#84fab0', '#8fd3f4'],
      ['#FCCF31', '#F55555'],
      ['#43E97B', '#38F9D7']
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = (hash << 5) - hash + name.charCodeAt(i)
      hash |= 0
    }
    const idx = Math.abs(hash) % palettes.length
    const [a, b] = palettes[idx]
    return `linear-gradient(90deg, ${a}, ${b})`
  }

  const headerGradient = useMemo(() => getGradientForEvent(event.name || ''), [event.name])

  // Modal state for showing event details overlay
  const [selectedItem, setSelectedItem] = useState<DayItem | null>(null)

  const openEventModal = (item: DayItem) => {
    setSelectedItem(item)
  }

  const closeEventModal = () => setSelectedItem(null)

  // inside-modal selected task for per-task themed view
  const [modalTask, setModalTask] = useState<ExtendedTask | null>(null)

  // compute gradient for the currently selected task (or fallback to group first task)
  const modalGradient = useMemo(() => {
    const name = modalTask?.name || selectedItem?.tasks?.[0]?.name || ''
    return getGradientForEvent(name)
  }, [modalTask, selectedItem])

  // when opening modal, default modalTask to first task in group
  useEffect(() => {
    if (selectedItem) {
      setModalTask(selectedItem.tasks[0] || null)
    } else {
      setModalTask(null)
    }
  }, [selectedItem])

  // Helper: pick a task id within a grouped item for assigning/unassigning
  const findAssignableTaskId = (item: DayItem) => {
    // prefer a task that has capacity and is not assigned to current volunteer
    for (const t of item.tasks) {
      const isAssigned = t.task_assignments?.some(a => a.volunteer.id === volunteerId)
      const assignmentCount = t.task_assignments?.length || 0
      if (!isAssigned && assignmentCount < t.volunteers_required) return t.id
    }
    // otherwise return first task id
    return item.tasks[0]?.id
  }

  const findAssignmentTaskId = (item: DayItem) => {
    for (const t of item.tasks) {
      const assignment = t.task_assignments?.find(a => a.volunteer.id === volunteerId)
      if (assignment) return t.id
    }
    return null
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
        <div className="flex items-center justify-between flex-wrap gap-4">
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

          {volunteerId && (
            <div className="flex items-center gap-3">
              {(() => {
                const currentHours = calculateVolunteerHours()
                const minHours = event.min_volunteer_hours
                const maxHours = event.max_volunteer_hours
                const isUnderMin = currentHours < minHours
                const isNearMax = maxHours && currentHours >= maxHours * 0.8
                const isAtMax = maxHours && currentHours >= maxHours

                return (
                  <>
                    <div className={`px-4 py-2 rounded-lg border-2 ${
                      isAtMax ? 'bg-red-50 border-red-300' :
                      isNearMax ? 'bg-yellow-50 border-yellow-300' :
                      isUnderMin ? 'bg-blue-50 border-blue-300' :
                      'bg-green-50 border-green-300'
                    }`}>
                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${
                          isAtMax ? 'text-red-600' :
                          isNearMax ? 'text-yellow-600' :
                          isUnderMin ? 'text-blue-600' :
                          'text-green-600'
                        }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <p className="text-xs font-medium text-gray-600">Your Hours</p>
                          <p className={`text-sm font-bold ${
                            isAtMax ? 'text-red-700' :
                            isNearMax ? 'text-yellow-700' :
                            isUnderMin ? 'text-blue-700' :
                            'text-green-700'
                          }`}>
                            {currentHours.toFixed(1)}h
                            {maxHours && ` / ${maxHours}h`}
                          </p>
                        </div>
                      </div>
                    </div>

                    {isUnderMin && (
                      <div className="text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-md border border-blue-200">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Goal: {minHours}h
                      </div>
                    )}

                    {isAtMax && (
                      <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-md border border-red-200 font-medium">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Maximum reached
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          )}

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

        {error && !showErrorModal && (
          <div className="mt-4 rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}
      </div>

      {/* Volunteers list (live) - moved to top for visibility */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-gray-700 font-medium">Volunteers</div>
          <div className="text-xs text-gray-500">{volunteers.length} total</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {volunteers.map((v: Volunteer) => {
            const assignedCount = tasks.reduce((s, t) => s + (t.task_assignments?.filter(a => a.volunteer.id === v.id).length || 0), 0)
            return (
              <div key={v.id} className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-700">
                <span className="h-2 w-2 rounded-full bg-green-400" />
                <span>{v.name}</span>
                <span className="ml-2 text-[11px] text-gray-500">{assignedCount}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Event Header (themed by event name) */}
      <div className="mb-4 rounded-lg overflow-hidden shadow-sm">
        <div className="p-4 text-white" style={{ background: headerGradient }}>
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">{event.name}</h2>
              <div className="text-sm opacity-90">{new Date(event.start_date).toLocaleDateString()} — {new Date(event.end_date).toLocaleDateString()}</div>
            </div>
            <div className="text-sm opacity-90">{event.min_volunteer_hours}h min</div>
          </div>
        </div>
      </div>

      {/* Day view controls */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setCurrentDate(startOfDay(new Date()))} className="text-sm text-gray-700">Today</button>
            <button onClick={() => setCurrentDate(prev => addDays(prev, -1))} className="text-sm text-gray-700">Back</button>
            <button onClick={() => setCurrentDate(prev => addDays(prev, 1))} className="text-sm text-gray-700">Next</button>
          </div>

          <div className="text-sm font-semibold">{format(currentDate, 'EEEE MMM d')}</div>

          <div className="flex items-center gap-2">
            <button onClick={() => setViewMode('month')} className={`px-3 py-1 rounded text-sm ${viewMode==='month' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700'}`}>Month</button>
            <button onClick={() => setViewMode('week')} className={`px-3 py-1 rounded text-sm ${viewMode==='week' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700'}`}>Week</button>
            <button onClick={() => setViewMode('day')} className={`px-3 py-1 rounded text-sm ${viewMode==='day' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700'}`}>Day</button>
            <button onClick={() => setViewMode('agenda')} className={`px-3 py-1 rounded text-sm ${viewMode==='agenda' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700'}`}>Agenda</button>
          </div>
        </div>

        <div className="mt-4 flex">
          <div className="w-24 border-r bg-gray-50 hidden sm:block">
            <div className="h-12" />
            {hours.map((h) => (
              <div key={h} className="h-12 px-2 text-xs text-gray-500 flex items-start pr-2">
                {format(new Date().setHours(h, 0, 0, 0), 'h:mm a')}
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-auto">
            <div className="min-w-full p-4">
              <div className="relative bg-white border rounded" style={{ minHeight: 24 * 48 }}>
                {hours.map(h => (
                  <div key={h} className="h-12 border-t border-gray-100" />
                ))}

                {(() => {
                  const day = startOfDay(currentDate)
                  const dayStart = new Date(day)
                  dayStart.setHours(0,0,0,0)
                  const items = getDayItems(day)
                  const totalHeight = 24 * 48

                  return items.map((it: any) => {
                    const startMinutes = (it.start.getTime() - dayStart.getTime()) / 60000
                    const endMinutes = (it.end.getTime() - dayStart.getTime()) / 60000
                    const top = (startMinutes / (24 * 60)) * totalHeight
                    const height = Math.max(24, ((endMinutes - startMinutes) / (24 * 60)) * totalHeight)
                    const isAssigned = it.tasks.some((t: ExtendedTask) => t.task_assignments?.some(a => a.volunteer.id === volunteerId))
                    const assignmentCount = it.assignment_count
                    const isFull = it.tasks.every((t: ExtendedTask) => (t.task_assignments?.length || 0) >= t.volunteers_required)

                    // call findAssignmentTaskId once to satisfy the typechecker and avoid repeated calls
                    const assignedTaskId = findAssignmentTaskId(it)
                    const assignableTaskId = findAssignableTaskId(it)

                    return (
                      <div key={it.id} className="absolute left-0 right-0 px-3" style={{ top, height }}>
                        <div onClick={() => openEventModal(it)} className="h-full p-3 rounded shadow-sm text-sm cursor-pointer overflow-hidden flex items-start justify-between" style={{ backgroundColor: isAssigned ? '#DBEAFE' : isFull ? '#FEE2E2' : '#F9FAFB', borderLeft: `4px solid ${it.task_type?.color || '#9CA3AF'}` }}>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">{it.tasks[0].name}</div>
                            <div className="text-gray-600 text-xs">{format(it.start, 'h:mm a')} — {format(it.end, 'h:mm a')}</div>
                            <div className="text-xs text-gray-500">{assignmentCount}/{it.volunteers_required} volunteers</div>
                          </div>
                          <div className="flex-shrink-0 ml-4">
                            {assignedTaskId ? (
                              <button onClick={(e) => { e.stopPropagation(); handleUnassignTask(assignedTaskId as string) }} className="px-2 py-1 bg-red-500 text-white rounded text-xs">Unassign</button>
                            ) : (
                              <button onClick={(e) => { e.stopPropagation(); assignableTaskId && handleAssignTask(assignableTaskId as string) }} disabled={isFull} className="px-2 py-1 bg-linear-to-r from-orange-500 to-purple-600 text-white rounded text-xs disabled:opacity-50">{isFull ? 'Full' : 'Assign'}</button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
              {/* Event Details Modal (overlay) */}
              {selectedItem ? (
                <div onClick={closeEventModal} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg overflow-hidden max-w-3xl w-full mx-4">
                    {/* Themed header based on selected task name */}
                    <div className="p-4 text-white" style={{ background: modalGradient }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-bold">{modalTask?.name || selectedItem.tasks[0]?.name}</h3>
                          <div className="text-sm opacity-90">{format(selectedItem.start, 'eee, MMM d')} — {format(selectedItem.end, 'eee, MMM d')}</div>
                        </div>
                        <div className="text-sm opacity-90">{selectedItem.assignment_count}/{selectedItem.volunteers_required} volunteers</div>
                      </div>
                    </div>

                    <div className="p-6 grid grid-cols-1 md:grid-cols-1 gap-4">
                      {/* <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Tasks in this group</h4>
                        <div className="space-y-2 max-h-64 overflow-auto">
                          {selectedItem.tasks.map(t => {
                            const isActive = modalTask?.id === t.id
                            return (
                              <div key={t.id} onClick={() => setModalTask(t)} className={`p-3 border rounded cursor-pointer ${isActive ? 'ring-2 ring-offset-1 ring-indigo-400' : ''}`}>
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="text-sm font-medium">{t.name}</div>
                                    <div className="text-xs text-gray-600">{new Date(t.start_datetime).toLocaleString()} — {new Date(t.end_datetime).toLocaleString()}</div>
                                  </div>
                                  <div className="text-xs text-gray-600">{t.task_assignments?.length || 0}/{t.volunteers_required}</div>
                                </div>
                                {t.task_assignments && t.task_assignments.length > 0 && (
                                  <div className="text-xs text-gray-700 mt-2">Volunteers: {t.task_assignments.map(a => a.volunteer.name).join(', ')}</div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div> */}

                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Task Details</h4>
                        {modalTask ? (
                          <div className="p-4 border rounded">
                            <div className="flex items-start justify-between">
                              <div>
                                {/* <div className="text-lg font-semibold">{modalTask.name}</div> */}
                                <div className="text-xs text-gray-600">{new Date(modalTask.start_datetime).toLocaleString()} — {new Date(modalTask.end_datetime).toLocaleString()}</div>
                                <div className="text-xs text-gray-600 mt-2">Type: {modalTask.task_type?.name || '—'}</div>
                                <div className="text-xs text-gray-600">Required: {modalTask.volunteers_required} • Assigned: {modalTask.task_assignments?.length || 0}</div>
                                {modalTask.task_assignments && modalTask.task_assignments.length > 0 && (
                                  <div className="text-xs text-gray-700 mt-2">
                                    <div className="text-xs font-medium mb-1">Assigned</div>
                                    <ul className="list-disc list-inside">
                                      {modalTask.task_assignments.map(a => (
                                        <li key={a.id}>{a.volunteer.name}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                              <div className="ml-4">
                                {modalTask.task_assignments?.some(a => a.volunteer.id === volunteerId) ? (
                                  <button onClick={(e) => { e.stopPropagation(); handleUnassignTask(modalTask.id) }} className="px-3 py-2 bg-red-500 text-white rounded">Unassign</button>
                                ) : (
                                  <button onClick={(e) => { e.stopPropagation(); handleAssignTask(modalTask.id) }} className="px-3 py-2 bg-linear-to-r from-orange-500 to-purple-600 text-white rounded">Assign</button>
                                )}
                              </div>
                            </div>
                            <div className="mt-3 text-sm text-gray-700">{modalTask.description || ''}</div>

                            {/* Map preview if task includes an address or coordinates */}
                            {(() => {
                              const addr = (modalTask as any)?.location || (modalTask as any)?.address || (modalTask as any)?.venue
                              const lat = (modalTask as any)?.lat || (modalTask as any)?.latitude || (modalTask as any)?.lng || (modalTask as any)?.longitude
                              if (lat && typeof lat === 'number') {
                                // if we have numeric lat/lng, render Google Maps embed with coordinates
                                const lng = (modalTask as any)?.lng || (modalTask as any)?.longitude
                                const src = `https://www.google.com/maps?q=${lat},${lng}&output=embed`
                                return (
                                  <div className="mt-4">
                                    <div className="text-xs text-gray-600 mb-2">Location</div>
                                    <div className="w-full h-48 rounded overflow-hidden border">
                                      <iframe className="w-full h-full" src={src} />
                                    </div>
                                  </div>
                                )
                              }

                              if (addr && typeof addr === 'string') {
                                const src = `https://www.google.com/maps?q=${encodeURIComponent(addr)}&output=embed`
                                return (
                                  <div className="mt-4">
                                    <div className="text-xs text-gray-600 mb-2">Location</div>
                                    <div className="w-full h-48 rounded overflow-hidden border">
                                      <iframe className="w-full h-full" src={src} />
                                    </div>
                                    <div className="mt-2 text-xs text-gray-500"><a className="underline" target="_blank" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`}>Open in Maps</a></div>
                                  </div>
                                )
                              }

                              return null
                            })()}
                          </div>
                        ) : (
                          <div className="p-4 text-sm text-gray-600">Select a task from the left to view details.</div>
                        )}
                      </div>
                    </div>
                    <div className="p-4 border-t flex justify-end">
                      <button onClick={closeEventModal} className="px-3 py-2 bg-gray-200 rounded">Close</button>
                    </div>
                  </div>
                </div>
              ) : null}
      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Enter Your Name
            </h3>
            <form onSubmit={handleAuth}>
              {error && !showErrorModal && (
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

      {/* Error Modal */}
      {showErrorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 border-4 border-red-500">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-lg font-bold text-red-900 mb-2">
                  Maximum Hours Exceeded
                </h3>
                <p className="text-sm text-red-700">
                  {error}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setShowErrorModal(false)
                setError(null)
              }}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
