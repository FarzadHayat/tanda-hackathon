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
  const [volunteerName, setVolunteerName] = useState<string>('')
  const [volunteerId, setVolunteerId] = useState<string | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showErrorModal, setShowErrorModal] = useState(false)
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [filterTaskType, setFilterTaskType] = useState<string>('all')
  const [filterVolunteer, setFilterVolunteer] = useState<string>('all')
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()
  const bcRef = useRef<BroadcastChannel | null>(null)
  const cursorChannelRef = useRef<any | null>(null)
  const timelineWrapperRef = useRef<HTMLDivElement | null>(null)
  const lastCursorSentRef = useRef<number>(0)
  const lastLocalCursorRef = useRef<{ leftPct: number; topPct: number } | null>(null)

  type CursorInfo = {
    volunteerId: string
    name: string
    initials?: string
    color?: string
    leftPct: number
    topPct: number
    taskId?: string | null
    lastSeen?: number
  }

  const [cursors, setCursors] = useState<Record<string, CursorInfo>>({})
  const broadChannelRef = useRef<any | null>(null)
  const filteredChannelRef = useRef<any | null>(null)
  const tasksChannelRef = useRef<any | null>(null)
  const tasksRef = useRef<ExtendedTask[]>(initialTasks)
  const lastRealtimeRef = useRef<number>(0)
  const pollRef = useRef<number | null>(null)
  const lastRefreshRef = useRef<number>(0)
  const pendingRefreshRef = useRef<NodeJS.Timeout | null>(null)

  // Load volunteer from localStorage
  useEffect(() => {
    const savedVolunteer = localStorage.getItem(`volunteer_${event.id}`)
    if (savedVolunteer) {
      const { id, name } = JSON.parse(savedVolunteer)
      setVolunteerId(id)
      setVolunteerName(name)
    }
  }, [event.id])

  // avatar upload removed — only keep name/id for volunteers

  // Subscription for task_assignments changes (assign/unassign)
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
                throttledRefresh()
                try { bcRef.current?.postMessage('refresh') } catch (e) { }
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
      } catch (e) { }
    }
  }, [supabase, event.id])

  // Subscription for tasks table changes (add/edit/delete tasks)
  useEffect(() => {
    const setup = () => {
      if (tasksChannelRef.current) return
      tasksChannelRef.current = supabase
        .channel(`event_tasks_${event.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tasks',
            filter: `event_id=eq.${event.id}`
          },
          () => {
            lastRealtimeRef.current = Date.now()
            throttledRefresh()
            try { bcRef.current?.postMessage('refresh') } catch (e) { }
          }
        )
        .subscribe()
    }

    setup()

    return () => {
      try {
        if (tasksChannelRef.current) {
          supabase.removeChannel(tasksChannelRef.current)
          tasksChannelRef.current = null
        }
      } catch (e) { }
    }
  }, [supabase, event.id])

  // Cleanup pending refresh on unmount
  useEffect(() => {
    return () => {
      if (pendingRefreshRef.current) {
        clearTimeout(pendingRefreshRef.current)
        pendingRefreshRef.current = null
      }
    }
  }, [])

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
    } catch (e) { }

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
          try { bcRef.current?.postMessage('refresh') } catch (e) { }
        }
      )
      .subscribe()

    return () => {
      try {
        if (filteredChannelRef.current) {
          supabase.removeChannel(filteredChannelRef.current)
          filteredChannelRef.current = null
        }
      } catch (e) { }
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
      try { bcRef.current?.close() } catch (e) { }
      bcRef.current = null
    }
  }, [event.id])

  // Polling fallback: if we haven't received realtime events recently,
  // poll periodically to ensure updates propagate.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const POLL_INTERVAL = 5_000 // 5s
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

  // Collaborative cursors: Supabase broadcast + BroadcastChannel fallback
  useEffect(() => {
    if (typeof window === 'undefined') return

    // pick color deterministically
    const pickColorForVolunteer = (id: string) => {
      const colors = ['#FF6B6B', '#6BCB77', '#4D96FF', '#FFD166', '#845EC2', '#FF9671']
      let h = 0
      for (let i = 0; i < id.length; i++) h = (h << 5) - h + id.charCodeAt(i)
      return colors[Math.abs(h) % colors.length]
    }

    const handleIncoming = (payload: any) => {
      try {
        const p = payload?.payload || payload
        if (!p || !p.volunteerId) return
        setCursors(prev => ({
          ...prev,
          [p.volunteerId]: {
            volunteerId: p.volunteerId,
            name: p.name || '',
            initials: p.initials || (p.name || '').split(' ').map((s: string) => s[0]).join('').toUpperCase(),
            color: p.color || pickColorForVolunteer(p.volunteerId),
            leftPct: typeof p.leftPct === 'number' ? p.leftPct : 0,
            topPct: typeof p.topPct === 'number' ? p.topPct : 0,
            taskId: p.taskId || null,
            lastSeen: typeof p.lastSeen === 'number' ? p.lastSeen : Date.now()
          }
        }))
      } catch (e) { }
    }

    // Supabase broadcast channel for cursors
    try {
      cursorChannelRef.current = supabase
        .channel(`event_cursors_${event.id}`)
        .on('broadcast', { event: 'cursor' }, (p: any) => handleIncoming(p))
        .subscribe()
    } catch (e) {
      cursorChannelRef.current = null
    }

    // BroadcastChannel fallback for same-tab messaging
    let localBc: BroadcastChannel | null = null
    try {
      localBc = new BroadcastChannel(`tanda_event_cursors_${event.id}`)
      localBc.onmessage = (ev) => {
        handleIncoming(ev.data)
      }
    } catch (e) {
      localBc = null
    }

    // periodic prune of stale cursors (6s)
    const PRUNE_MS = 6_000
    const pruneInterval = window.setInterval(() => {
      const now = Date.now()
      setCursors(prev => {
        const out: Record<string, any> = {}
        Object.keys(prev).forEach(k => {
          if ((prev[k].lastSeen || 0) + PRUNE_MS > now) out[k] = prev[k]
        })
        return out
      })
    }, 2000)

    // attach pointer & touch handlers to timeline wrapper
    const el = timelineWrapperRef.current

    const throttledSend = (ev: any) => {
      try {
        if (!volunteerId) return
        if (!el) return

        // normalize coords for PointerEvent and TouchEvent
        let clientX: number | undefined
        let clientY: number | undefined

        if (ev instanceof PointerEvent) {
          clientX = ev.clientX
          clientY = ev.clientY
        } else if (ev.touches && ev.touches.length > 0) {
          clientX = ev.touches[0].clientX
          clientY = ev.touches[0].clientY
        } else if (ev.changedTouches && ev.changedTouches.length > 0) {
          clientX = ev.changedTouches[0].clientX
          clientY = ev.changedTouches[0].clientY
        } else if (typeof ev.clientX === 'number' && typeof ev.clientY === 'number') {
          clientX = ev.clientX
          clientY = ev.clientY
        }

        if (typeof clientX !== 'number' || typeof clientY !== 'number') return

        const rect = el.getBoundingClientRect()
        const leftPct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
        const topPct = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100))
        const now = Date.now()
        if (now - (lastCursorSentRef.current || 0) < 80) return
        lastCursorSentRef.current = now

        const payload = {
          volunteerId,
          name: volunteerName,
          initials: (volunteerName || '').split(' ').map(s => s[0]).join('').toUpperCase(),
          color: pickColorForVolunteer(volunteerId),
          leftPct,
          topPct,
          taskId: null,
          lastSeen: now
        }

        // send via supabase broadcast channel
        try {
          cursorChannelRef.current?.send?.({ type: 'broadcast', event: 'cursor', payload })
        } catch (e) { }

        // and via local BroadcastChannel
        try { localBc?.postMessage(payload) } catch (e) { }

        // remember last local coords and update our local view immediately
        try { lastLocalCursorRef.current = { leftPct, topPct } } catch (e) { }
        handleIncoming(payload)
      } catch (e) { }
    }

    // handle pointer leave for mouse/pointer devices only.
    const handlePointerLeave = (_ev: PointerEvent) => {
      if (!volunteerId) return
      // mark as leaving but keep lastSeen as now so other clients keep the last point until prune
      setCursors(prev => {
        const copy = { ...prev }
        if (copy[volunteerId]) copy[volunteerId].lastSeen = Date.now()
        return copy
      })
      try {
        // include last known coords so other clients don't snap cursor to 0,0
        const last = lastLocalCursorRef.current
        const payload: any = { volunteerId, lastSeen: Date.now() }
        if (last) {
          payload.leftPct = last.leftPct
          payload.topPct = last.topPct
        }
        cursorChannelRef.current?.send?.({ type: 'broadcast', event: 'cursor', payload })
        localBc?.postMessage(payload)
      } catch (e) { }
    }

    if (el) {
      el.addEventListener('pointermove', throttledSend)
      el.addEventListener('pointerdown', throttledSend)
        ; (el as any).addEventListener('touchmove', throttledSend, { passive: true })
        ; (el as any).addEventListener('touchstart', throttledSend, { passive: true })
      el.addEventListener('pointerleave', handlePointerLeave)
      // NOTE: do not clear cursor on touchend — keep it at last touch location until prune
    }

    return () => {
      try { if (cursorChannelRef.current) supabase.removeChannel(cursorChannelRef.current) } catch (e) { }
      try { localBc?.close() } catch (e) { }
      window.clearInterval(pruneInterval)
      if (el) {
        el.removeEventListener('pointermove', throttledSend)
        el.removeEventListener('pointerdown', throttledSend)
          ; (el as any).removeEventListener('touchmove', throttledSend)
          ; (el as any).removeEventListener('touchstart', throttledSend)
        el.removeEventListener('pointerleave', handlePointerLeave)
      }
    }
  }, [event.id, supabase, volunteerId, volunteerName])
  // Throttled refresh with 1-second cooldown
  const throttledRefresh = () => {
    const now = Date.now()
    const timeSinceLastRefresh = now - lastRefreshRef.current

    // Clear any pending refresh
    if (pendingRefreshRef.current) {
      clearTimeout(pendingRefreshRef.current)
      pendingRefreshRef.current = null
    }

    // If cooldown period has passed, refresh immediately
    if (timeSinceLastRefresh >= 1000) {
      lastRefreshRef.current = now
      refreshTasks()
      refreshVolunteers()
    } else {
      // Otherwise, schedule a refresh after cooldown completes
      const timeToWait = 1000 - timeSinceLastRefresh
      pendingRefreshRef.current = setTimeout(() => {
        lastRefreshRef.current = Date.now()
        refreshTasks()
        refreshVolunteers()
        pendingRefreshRef.current = null
      }, timeToWait)
    }
  }

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

      // If user selected an avatar file, upload it to Supabase Storage
      // Save volunteer info (only id + name — avatar support removed)
      localStorage.setItem(`volunteer_${event.id}`, JSON.stringify({ id: volunteerId, name: volunteerName.trim() }))

      setVolunteerId(volunteerId)
      // ensure name stored
      // Ensure volunteers list updates immediately for this client
      try {
        await refreshVolunteers()
      } catch (e) {
        // ignore
      }
      setShowAuthModal(false)

      // If there was a pending task assignment, execute it now
      if (pendingTaskId) {
        const taskIdToAssign = pendingTaskId
        setPendingTaskId(null)
        // Pass volunteerId directly to avoid state timing issues
        handleAssignTask(taskIdToAssign, volunteerId)
      }
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

  const handleAssignTask = async (taskId: string, overrideVolunteerId?: string) => {
    const effectiveVolunteerId = overrideVolunteerId || volunteerId

    if (!effectiveVolunteerId) {
      setPendingTaskId(taskId)
      setShowAuthModal(true)
      return
    }

    setError(null)

    try {
      const task = tasks.find(t => t.id === taskId)
      if (!task) return

      // Check if already assigned
      const isAssigned = task.task_assignments?.some(
        a => a.volunteer.id === effectiveVolunteerId
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
          volunteer_id: effectiveVolunteerId,
        })

      if (error) throw error

      // locally refresh and notify other tabs/clients
      await refreshTasks()
      try {
        await refreshVolunteers()
      } catch { }
      try { bcRef.current?.postMessage('refresh') } catch (e) { }
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
      } catch { }
      try { bcRef.current?.postMessage('refresh') } catch (e) { }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  // Calculate calendar structure (showing all days from event start to end)
  const eventStart = startOfDay(new Date(event.start_date))
  const eventEnd = startOfDay(new Date(event.end_date))
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
            ; (item as any)._col = ci
          placed = true
          break
        }
      }

      if (!placed) {
        columns.push(e)
          ; (item as any)._col = columns.length - 1
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
      ['#E85D04', '#DC2F02'],  // Deep orange to red
      ['#6A4C93', '#8B5CF6'],  // Deep purple to violet
      ['#0077B6', '#0096C7'],  // Deep blue
      ['#2A9D8F', '#06A77D'],  // Deep teal to green
      ['#C9184A', '#A4133C'],  // Deep rose to burgundy
      ['#0B5E90', '#1E88E5'],  // Navy to bright blue
      ['#D00000', '#9D0208']   // Deep red
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

  // Update modalTask when tasks change (e.g., after assignment/unassignment)
  useEffect(() => {
    if (modalTask) {
      const updatedTask = tasks.find(t => t.id === modalTask.id)
      if (updatedTask) {
        setModalTask(updatedTask)
      }
    }
  }, [tasks])

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
      {/* Event Header (themed by event name) */}
      <div className="mb-4 rounded-lg overflow-hidden shadow-sm">
        <div className="p-4 text-white" style={{ background: headerGradient }}>
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex-1">
              <h2 className="text-lg font-bold">{event.name}</h2>
              <div className="text-sm opacity-90">{new Date(event.start_date).toLocaleDateString()} — {new Date(event.end_date).toLocaleDateString()}</div>
              {event.description && (
                <div className="text-sm opacity-90 mt-2">{event.description}</div>
              )}
            </div>
          </div>
        </div>
      </div>

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
                    <div className={`px-4 py-2 rounded-lg border-2 ${isAtMax ? 'bg-red-50 border-red-300' :
                      isNearMax ? 'bg-yellow-50 border-yellow-300' :
                        isUnderMin ? 'bg-blue-50 border-blue-300' :
                          'bg-green-50 border-green-300'
                      }`}>
                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isAtMax ? 'text-red-600' :
                          isNearMax ? 'text-yellow-600' :
                            isUnderMin ? 'text-blue-600' :
                              'text-green-600'
                          }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <p className="text-xs font-medium text-gray-600">Your Hours</p>
                          <p className={`text-sm font-bold ${isAtMax ? 'text-red-700' :
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

      {/* Collaborators strip (mobile-friendly) */}
      <div className="mb-3">
        <div className="flex items-center gap-2 overflow-x-auto py-2">
          {Object.values(cursors).length === 0 ? (
            <div className="text-xs text-gray-500 px-3">No collaborators online</div>
          ) : (
            Object.values(cursors).map((c) => (
              <div key={c.volunteerId} className="flex items-center gap-2 px-2 py-1 bg-white/80 rounded-full shadow-sm mr-2">
                <div style={{ background: c.color }} className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold">{c.initials || (c.name || '').slice(0, 2)}</div>
                <div className="text-xs font-medium text-gray-700">{c.name}</div>
                <div className="w-2 h-2 rounded-full bg-green-400 ml-1" />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Volunteers list (live) */}
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
                {/* try to show avatar from storage if present */}
                <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gray-300 text-xs font-medium text-gray-700">{(v.name || '').split(' ').map((s: string) => s[0]).slice(0, 2).join('')}</div>
                <span>{v.name}</span>
                <span className="ml-2 text-[11px] text-gray-500">{assignedCount}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Weekly Timeline View */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="flex">
          {/* Time Axis */}
          <div className="w-16 border-r bg-gray-50 hidden sm:block">
            <div className="h-12" />
            {hours.map((h) => (
              <div key={h} className="h-12 px-2 text-xs text-gray-500 flex items-start justify-end pr-2">
                {format(new Date().setHours(h, 0, 0, 0), 'HH:mm')}
              </div>
            ))}
          </div>

          {/* Days container */}
          <div className="flex-1 overflow-x-auto">
            <div ref={timelineWrapperRef} className="md:min-w-[700px] min-w-0 relative">
              {/* Day headers */}
              <div className="flex border-b bg-gray-50">
                {days.map((day) => (
                  <div key={day.toISOString()} className="flex-1 min-w-[200px] px-3 py-3 text-center text-xs font-medium text-gray-600">
                    {format(day, 'EEE, MMM d')}
                  </div>
                ))}
              </div>

              {/* Timeline grid */}
              <div className="flex">
                {days.map((day) => {
                  const totalHeight = 24 * 48 // 48px per hour
                  const dayStart = new Date(day)
                  dayStart.setHours(0, 0, 0, 0)
                  const items = getDayItems(day)

                  return (
                    <div key={day.toISOString()} className="relative flex-1 min-w-[200px] border-r border-gray-100" style={{ height: totalHeight }}>
                      {/* hour grid lines */}
                      {hours.map(h => (
                        <div key={h} className="h-12 border-t border-gray-100" />
                      ))}

                      {/* Items */}
                      {items.map((it: any) => {
                        const startMinutes = (it.start.getTime() - dayStart.getTime()) / 60000
                        const endMinutes = (it.end.getTime() - dayStart.getTime()) / 60000
                        const top = (startMinutes / (24 * 60)) * totalHeight
                        const height = Math.max(24, ((endMinutes - startMinutes) / (24 * 60)) * totalHeight)
                        const col = it._col ?? 0
                        const cols = it._cols ?? 1
                        const leftPct = (col / cols) * 100
                        const widthPct = 100 / cols
                        const isAssigned = it.tasks.some((t: ExtendedTask) => t.task_assignments?.some(a => a.volunteer.id === volunteerId))
                        const assignmentCount = it.assignment_count
                        const isFull = it.tasks.every((t: ExtendedTask) => (t.task_assignments?.length || 0) >= t.volunteers_required)

                        return (
                          <div
                            key={it.id}
                            className="absolute px-1"
                            style={{
                              top,
                              left: `${leftPct}%`,
                              width: `calc(${widthPct}% - 6px)`,
                              height,
                              zIndex: 10
                            }}
                          >
                            <div
                              onClick={() => openEventModal(it)}
                              className="h-full p-2 rounded shadow-sm text-xs cursor-pointer overflow-hidden border-2 flex items-start gap-2"
                              style={{
                                backgroundColor: (it.task_type?.color || '#9CA3AF') + '20',
                                borderColor: it.task_type?.color || '#9CA3AF'
                              }}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between mb-1">
                                  <div className="font-medium text-gray-900 truncate flex-1">{it.tasks[0].name}</div>
                                  <div className="flex-shrink-0 ml-1">
                                    {isAssigned ? (
                                      <span className="inline-block w-2 h-2 rounded-full bg-blue-500" title="You're assigned"></span>
                                    ) : isFull ? (
                                      <span className="inline-block w-2 h-2 rounded-full bg-red-500" title="Full"></span>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="text-gray-600 text-[11px]">{assignmentCount}/{it.volunteers_required} volunteers</div>
                              </div>
                              <div className="flex-shrink-0">
                                {findAssignmentTaskId(it) ? (
                                  <button onClick={(e) => { e.stopPropagation(); handleUnassignTask(findAssignmentTaskId(it) as string) }} className="p-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors" title="Unassign">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                ) : (
                                  <button onClick={(e) => { e.stopPropagation(); handleAssignTask(findAssignableTaskId(it) as string) }} disabled={isFull} className="p-1 bg-linear-to-r from-orange-500 to-purple-600 text-white rounded hover:from-orange-600 hover:to-purple-700 transition-colors disabled:opacity-50" title={isFull ? 'Task is full' : 'Assign me'}>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>

              {/* Cursor overlays */}
              <div className="absolute inset-0 pointer-events-none">
                {Object.values(cursors).map((c) => {
                  if (!c || c.volunteerId === volunteerId) return null
                  return (
                    <div key={c.volunteerId} style={{ position: 'absolute', left: `${c.leftPct}%`, top: `${c.topPct}%`, transform: 'translate(-50%,-50%)' }} className="pointer-events-none">
                      <div style={{ background: c.color, color: '#fff' }} className="flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium shadow">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: '#ffffff22', color: '#fff' }}>
                          <div style={{ background: c.color, width: 28, height: 28, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>{c.initials || c.name?.slice(0, 2)}</div>
                        </div>
                        <div className="hidden sm:block">{c.name}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>


      {/* Event Details Modal (overlay) */}
      {selectedItem && (
        <div onClick={closeEventModal} className="fixed inset-0 bg-black bg-opacity-50 flex items-start sm:items-center justify-center z-50 p-0 sm:p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-white overflow-hidden w-full h-full sm:max-w-2xl sm:max-h-[90vh] sm:rounded-lg flex flex-col">
            {/* Themed header */}
            <div className="p-6 text-white" style={{ background: modalGradient }}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-2xl font-bold mb-2">{modalTask?.name || selectedItem.tasks[0]?.name}</h3>
                  <div className="flex items-center gap-4 text-sm opacity-90">
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {format(selectedItem.start, 'MMM d, h:mm a')} - {format(selectedItem.end, 'h:mm a')}
                    </div>
                    {modalTask?.task_type && (
                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        {modalTask.task_type.name}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={closeEventModal}
                  className="ml-4 p-2 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {modalTask ? (
                <div className="space-y-6">
                  {/* Description */}
                  {modalTask.description && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Description</h4>
                      <p className="text-sm text-gray-600">{modalTask.description}</p>
                    </div>
                  )}

                  {/* Volunteers */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">
                      Volunteers ({modalTask.task_assignments?.length || 0}/{modalTask.volunteers_required})
                    </h4>
                    {modalTask.task_assignments && modalTask.task_assignments.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {modalTask.task_assignments.map((a, idx) => (
                          <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <span className="text-sm font-medium text-gray-700">{a.volunteer.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No volunteers assigned yet</p>
                    )}
                  </div>

                  {/* Location map */}
                  {(() => {
                    const addr = (modalTask as any)?.location || (modalTask as any)?.address || (modalTask as any)?.venue
                    const lat = (modalTask as any)?.lat || (modalTask as any)?.latitude || (modalTask as any)?.lng || (modalTask as any)?.longitude
                    if (lat && typeof lat === 'number') {
                      const lng = (modalTask as any)?.lng || (modalTask as any)?.longitude
                      const src = `https://www.google.com/maps?q=${lat},${lng}&output=embed`
                      return (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Location</h4>
                          <div className="w-full h-48 rounded-lg overflow-hidden border border-gray-200">
                            <iframe className="w-full h-full" src={src} />
                          </div>
                        </div>
                      )
                    }

                    if (addr && typeof addr === 'string') {
                      const src = `https://www.google.com/maps?q=${encodeURIComponent(addr)}&output=embed`
                      return (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Location</h4>
                          <div className="w-full h-48 rounded-lg overflow-hidden border border-gray-200">
                            <iframe className="w-full h-full" src={src} />
                          </div>
                          <a
                            className="inline-flex items-center gap-1 mt-2 text-xs text-orange-600 hover:text-orange-700 font-medium"
                            target="_blank"
                            rel="noopener noreferrer"
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            Open in Google Maps
                          </a>
                        </div>
                      )
                    }

                    return null
                  })()}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-sm">Select a task to view details</p>
                </div>
              )}
            </div>

            {/* Footer with action */}
            <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
              <button
                onClick={closeEventModal}
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 font-medium"
              >
                Close
              </button>
              {modalTask && (
                <div>
                  {modalTask.task_assignments?.some(a => a.volunteer.id === volunteerId) ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleUnassignTask(modalTask.id) }}
                      className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
                    >
                      Unassign Me
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleAssignTask(modalTask.id) }}
                      disabled={(modalTask.task_assignments?.length || 0) >= modalTask.volunteers_required}
                      className="px-6 py-2 bg-linear-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {(modalTask.task_assignments?.length || 0) >= modalTask.volunteers_required ? 'Task Full' : 'Assign Me'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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
              {/* profile photo removed — only name is required */}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-linear-to-r from-orange-500 to-purple-600 text-white rounded-md hover:from-orange-600 hover:to-purple-700"
                >
                  Continue
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAuthModal(false)
                    setPendingTaskId(null)
                  }}
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
