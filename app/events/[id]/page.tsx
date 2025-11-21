import { createClient } from '@/lib/supabase/server'
import { Event, TaskType, Task, TaskAssignment, Volunteer } from '@/lib/types/database'
import EventCalendar from '@/components/EventCalendar'
import { redirect } from 'next/navigation'

async function getEvent(eventId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
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
      task_type:task_types(*),
      task_assignments(
        id,
        volunteer:volunteers(*)
      )
    `)
    .eq('event_id', eventId)
    .order('start_datetime')

  if (error) {
    console.error('Error fetching tasks:', error)
    return []
  }

  return data
}

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEvent(id)

  if (!event) {
    redirect('/')
  }

  const [taskTypes, tasks] = await Promise.all([
    getTaskTypes(id),
    getTasks(id),
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">What am I Doing?</h1>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-[1600px] mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              {event.name}
            </h2>
            {event.description && (
              <p className="text-gray-600 mb-4">{event.description}</p>
            )}
            <div className="text-sm text-gray-500">
              <p>
                {new Date(event.start_date).toLocaleDateString()} -{' '}
                {new Date(event.end_date).toLocaleDateString()}
              </p>
            </div>
          </div>

          <EventCalendar
            event={event}
            taskTypes={taskTypes}
            initialTasks={tasks}
          />
        </div>
      </main>
    </div>
  )
}
