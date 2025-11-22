'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface EventCardProps {
  event: any
  gradient: string
}

export default function EventCard({ event, gradient }: EventCardProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', event.id)

      if (error) throw error

      router.refresh()
      setShowDeleteModal(false)
    } catch (err) {
      console.error('Error deleting event:', err)
      alert('Failed to delete event')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="group relative block bg-gray-50 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 border-2 border-gray-200 hover:border-orange-300 overflow-hidden">
        <div style={{ background: gradient }} className="p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">{event.name}</h3>
              <div className="text-xs opacity-90">{new Date(event.start_date).toLocaleDateString()} — {new Date(event.end_date).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
        <Link href={`/dashboard/events/${event.id}`}>
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
              <div className="flex items-center text-sm text-gray-700">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">Min Hours:</span>
                <span className="ml-1">{event.min_volunteer_hours}h</span>
              </div>
              {event.max_volunteer_hours && (
                <div className="flex items-center text-sm text-gray-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="font-medium">Max Hours:</span>
                  <span className="ml-1">{event.max_volunteer_hours}h</span>
                </div>
              )}
            </div>
          </div>
          <div className="absolute bottom-0 right-0 w-24 h-24 bg-linear-to-tl from-orange-50 to-transparent rounded-tl-full opacity-50 group-hover:opacity-100 transition-opacity"></div>
        </Link>

        {/* Delete button */}
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setShowDeleteModal(true)
          }}
          className="absolute top-2 right-2 p-2 bg-white bg-opacity-90 hover:bg-red-500 hover:text-white text-gray-600 rounded-full transition-colors z-20 shadow-md"
          title="Delete event"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  Delete Event
                </h3>
                <p className="text-sm text-gray-600 mb-2">
                  Are you sure you want to delete <strong>{event.name}</strong>?
                </p>
                <p className="text-sm text-red-600">
                  This will permanently delete the event and all associated tasks, task types, and assignments. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
