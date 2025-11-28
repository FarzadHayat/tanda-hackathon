import { createClient } from '@/lib/supabase/server'
import { Event, TaskType } from '@/lib/types/database'
import EventCalendar from '@/components/EventCalendar'
import { redirect } from 'next/navigation'
import Image from 'next/image'

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<{ title: string }> {
  const { id } = await params
  const event = await getEvent(id)
  
  return {
    title: event ? event.name : 'Event Not Found',
  }
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
      <nav className="bg-linear-to-r from-orange-500 to-purple-600 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Logo"
                width={40}
                height={40}
                className="rounded-lg"
              />
              <h1 className="text-xl font-bold text-white">What am I Doing?</h1>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-[1600px] mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
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
