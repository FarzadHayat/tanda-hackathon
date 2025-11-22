import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Event } from '@/lib/types/database'
import { signOut } from './actions'

// Utility to generate a simple gradient from the event name (server-safe)
function getGradientForEvent(name: string) {
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

async function getEvents(organizerId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('organizer_id', organizerId)
    .order('start_date', { ascending: false })

  if (error) {
    console.error('Error fetching events:', error)
    return []
  }

  return data as Event[]
}

type EventSummary = Event & {
  task_count: number
  volunteers_count: number
  total_assigned_hours: number
  avg_hours_per_volunteer: number
}

async function getEventSummaries(organizerId: string) {
  const supabase = await createClient()
  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .eq('organizer_id', organizerId)
    .order('start_date', { ascending: false })

  if (error || !events) return []

  const summaries = await Promise.all(events.map(async (ev: Event) => {
    // fetch tasks with assignments
    const { data: tasks } = await supabase
      .from('tasks')
      .select(`id, start_datetime, end_datetime, task_assignments(id, volunteer_id)`)
      .eq('event_id', ev.id)

    const { data: volunteers } = await supabase
      .from('volunteers')
      .select('id')
      .eq('event_id', ev.id)

    const task_count = (tasks && tasks.length) || 0
    const volunteers_count = (volunteers && volunteers.length) || 0
    const total_tasks = (tasks && tasks.length) || 0
    let total_tasks_hours = 0
    // compute per-volunteer hours from task assignments
    const hoursByVolunteer: Record<string, number> = {}
    if (tasks) {
      for (const t of tasks) {
        const start = new Date(t.start_datetime).getTime()
        const end = new Date(t.end_datetime).getTime()
        const hours = Math.max(0, (end - start) / (1000 * 60 * 60))
        total_tasks_hours += hours
        const assigns = (t.task_assignments || []) as Array<{ id: string; volunteer_id: string }>
        for (const a of assigns) {
          if (!a || !a.volunteer_id) continue
          hoursByVolunteer[a.volunteer_id] = (hoursByVolunteer[a.volunteer_id] || 0) + hours
        }
      }
    }
    console.log('Total tasks hours:', total_tasks_hours);
    const total_assigned_hours = Object.values(hoursByVolunteer).reduce((s, v) => s + v, 0)
    const avg_hours_per_volunteer = volunteers_count > 0 ? total_assigned_hours / volunteers_count : 0

    return {
      ...(ev as Event),
      task_count,
      volunteers_count,
      total_assigned_hours,
      avg_hours_per_volunteer,
    } as EventSummary
  }))

  return summaries
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const events = await getEventSummaries(user.id)

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-linear-to-r from-orange-500 to-purple-600 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-white">What am I Doing?</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-white">{user.email}</span>
              <form action={signOut}>
                <button
                  type="submit"
                  className="text-sm text-white hover:text-gray-100"
                >
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Your Events</h2>
            <Link
              href="/dashboard/events/new"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-linear-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              Create Event
            </Link>
          </div>

          {events.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl shadow-lg border-2 border-gray-200">
              <div className="max-w-sm mx-auto">
                <div className="w-16 h-16 bg-linear-to-br from-orange-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No events yet</h3>
                <p className="text-gray-600">
                  Get started by creating your first event.
                </p>
              </div>
            </div>
            ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {events.map((event: any) => (
                <Link
                  key={event.id}
                  href={`/dashboard/events/${event.id}`}
                  className="group relative block bg-gray-50 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 border-2 border-gray-200 hover:border-orange-300 overflow-hidden"
                >
                  <div style={{ background: getGradientForEvent(event.name || '') }} className="p-4 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold">{event.name}</h3>
                        <div className="text-xs opacity-90">{new Date(event.start_date).toLocaleDateString()} — {new Date(event.end_date).toLocaleDateString()}</div>
                      </div>
                      <div className="text-sm opacity-90">{event.task_count} tasks</div>
                    </div>
                  </div>
                  <div className="relative z-10 p-6">
                    {event.description && (
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                        {event.description}
                      </p>
                    )}
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center text-sm text-gray-700 justify-between">
                        <div className="flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <div>
                            <div className="text-xs text-gray-500">Start</div>
                            <div className="text-sm font-medium">{new Date(event.start_date).toLocaleDateString()}</div>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <div>
                            <div className="text-xs text-gray-500">End</div>
                            <div className="text-sm font-medium">{new Date(event.end_date).toLocaleDateString()}</div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div className="p-3 bg-white rounded-md border border-gray-100 text-center">
                          <div className="text-xs text-gray-500">Tasks</div>
                          <div className="text-lg font-bold text-gray-900">{event.task_count}</div>
                        </div>
                        <div className="p-3 bg-white rounded-md border border-gray-100 text-center">
                          <div className="text-xs text-gray-500">Volunteers</div>
                          <div className="text-lg font-bold text-gray-900">{event.volunteers_count}</div>
                        </div>
                        <div className="p-3 bg-white rounded-md border border-gray-100 text-center">
                          <div className="text-xs text-gray-500">Total Assigned Hours</div>
                          <div className="text-lg font-bold text-gray-900">{event.total_assigned_hours.toFixed(1)}</div>
                          <div className="text-xs text-gray-500">avg {event.avg_hours_per_volunteer.toFixed(1)} / vol</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute bottom-0 right-0 w-24 h-24 bg-linear-to-tl from-orange-50 to-transparent rounded-tl-full opacity-50 group-hover:opacity-100 transition-opacity"></div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
