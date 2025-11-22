import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Event, TaskType, Task } from '@/lib/types/database'
import TaskTypeManager from '@/components/TaskTypeManager'
import TaskManager from '@/components/TaskManager'
import CopyButton from '@/components/CopyButton'

async function getEvent(eventId: string, userId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .eq('organizer_id', userId)
    .single()

  if (error) {
    console.error('Error fetching event:', error)
    return null
  }

  return data as Event
}

async function getTaskTypes(eventId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('task_types')
    .select('*')
    .eq('event_id', eventId)
    .order('name')

  if (error) {
    console.error('Error fetching task types:', error)
    return []
  }

  return data as TaskType[]
}

async function getTasks(eventId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      task_type:task_types(*)
    `)
    .eq('event_id', eventId)
    .order('start_datetime')

  if (error) {
    console.error('Error fetching tasks:', error)
    return []
  }

  return data as Task[]
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const event = await getEvent(id, user.id)

  if (!event) {
    redirect('/dashboard')
  }

  const [taskTypes, tasks] = await Promise.all([
    getTaskTypes(id),
    getTasks(id),
  ])

  const eventUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/events/${event.id}`

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-linear-to-r from-orange-500 to-purple-600 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/dashboard" className="text-xl font-bold text-white">
                What am I Doing?
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <Link
              href="/dashboard"
              className="text-sm text-orange-600 hover:text-orange-800"
            >
              &larr; Back to Dashboard
            </Link>
          </div>

          <div className="relative bg-gray-50 shadow-lg rounded-xl p-6 mb-6 border-2 border-gray-200 overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-linear-to-r from-orange-500 to-purple-600"></div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-bl from-purple-50 to-transparent rounded-bl-full opacity-50"></div>
            <div className="relative z-10">
              <h2 className="text-3xl font-bold text-gray-900 mb-4 bg-linear-to-r from-orange-600 to-purple-600 bg-clip-text text-transparent">
                {event.name}
              </h2>
              {event.description && (
                <p className="text-gray-700 mb-6 text-lg">{event.description}</p>
              )}
              <div className="flex flex-wrap gap-4 mb-6">
                <div className="flex items-center px-4 py-2 bg-linear-to-br from-orange-50 to-orange-100 rounded-lg border border-orange-200">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <p className="text-xs text-orange-700 font-medium">Start Date</p>
                    <p className="text-sm font-bold text-orange-900">{new Date(event.start_date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center px-4 py-2 bg-linear-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <p className="text-xs text-purple-700 font-medium">End Date</p>
                    <p className="text-sm font-bold text-purple-900">{new Date(event.end_date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center px-4 py-2 bg-linear-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-xs text-green-700 font-medium">Min Hours Goal</p>
                    <p className="text-sm font-bold text-green-900">{event.min_volunteer_hours}h</p>
                  </div>
                </div>
                {event.max_volunteer_hours && (
                  <div className="flex items-center px-4 py-2 bg-linear-to-br from-red-50 to-red-100 rounded-lg border border-red-200">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="text-xs text-red-700 font-medium">Max Hours Limit</p>
                      <p className="text-sm font-bold text-red-900">{event.max_volunteer_hours}h</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-linear-to-br from-blue-50 to-blue-100 p-5 rounded-xl border-2 border-blue-200">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-blue-900 mb-2">
                      Share this link with volunteers:
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={eventUrl}
                        className="flex-1 px-3 py-2 border-2 border-blue-300 rounded-lg text-sm bg-gray-100 focus:outline-none focus:border-blue-500"
                      />
                      <CopyButton text={eventUrl} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <TaskTypeManager eventId={event.id} initialTaskTypes={taskTypes} />
            <TaskManager
              eventId={event.id}
              event={event}
              taskTypes={taskTypes}
              initialTasks={tasks}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
