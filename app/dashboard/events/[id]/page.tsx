import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Image from 'next/image'
import { Event, TaskType, Task } from '@/lib/types/database'
import TaskTypeManager from '@/components/TaskTypeManager'
import TaskManager from '@/components/TaskManager'
import EventHeader from '@/components/EventHeader'
import VolunteerWorkloadChart from '@/components/VolunteerWorkloadChart'
import { signOut } from '@/app/dashboard/actions'

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
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Logo"
                width={40}
                height={40}
                className="rounded-lg"
              />
              <Link href="/dashboard" className="text-xl font-bold text-white">
                What am I Doing?
              </Link>
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
          <div className="mb-6">
            <Link
              href="/dashboard"
              className="text-sm text-orange-600 hover:text-orange-800"
            >
              &larr; Back to Dashboard
            </Link>
          </div>

          <EventHeader event={event} eventUrl={eventUrl} />

          <div className="grid gap-6 lg:grid-cols-2">
            <TaskTypeManager eventId={event.id} initialTaskTypes={taskTypes} />
            <TaskManager
              eventId={event.id}
              event={event}
              taskTypes={taskTypes}
              initialTasks={tasks}
            />
          </div>

          <div className="mt-6">
            <VolunteerWorkloadChart eventId={event.id} event={event} />
          </div>
        </div>
      </main>
    </div>
  )
}
