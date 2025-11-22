'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { Event } from '@/lib/types/database'
import CopyButton from '@/components/CopyButton'
import EditEventModal from '@/components/EditEventModal'
import QRCodeModal from '@/components/QRCodeModal'
import { createClient } from '@/lib/supabase/client'

interface EventHeaderProps {
  event: Event
  eventUrl: string
}

export default function EventHeader({ event, eventUrl }: EventHeaderProps) {
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showQRModal, setShowQRModal] = useState(false)
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

      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      console.error('Error deleting event:', err)
      alert('Failed to delete event')
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="relative bg-gray-50 shadow-lg rounded-xl p-6 mb-6 border-2 border-gray-200 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-linear-to-r from-orange-500 to-purple-600"></div>
        <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-bl from-purple-50 to-transparent rounded-bl-full opacity-50"></div>
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-3xl font-bold text-gray-900 bg-linear-to-r from-orange-600 to-purple-600 bg-clip-text text-transparent">
              {event.name}
            </h2>
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-orange-500 text-orange-600 rounded-lg font-medium hover:bg-orange-50 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Event
            </button>
          </div>
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
                  <p className="text-sm font-bold text-orange-900">{format(new Date(event.start_date), 'MMM d, yyyy')}</p>
              </div>
            </div>
            <div className="flex items-center px-4 py-2 bg-linear-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div>
                <p className="text-xs text-purple-700 font-medium">End Date</p>
                  <p className="text-sm font-bold text-purple-900">{format(new Date(event.end_date), 'MMM d, yyyy')}</p>
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
                  <button
                    onClick={() => setShowQRModal(true)}
                    className="px-4 py-2 bg-linear-to-r from-orange-600 to-purple-700 text-white rounded-lg hover:from-orange-700 hover:to-purple-800 font-medium transition-all flex items-center gap-2"
                    title="Show QR Code"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    QR Code
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <EditEventModal
        event={event}
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
      />

      <QRCodeModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        url={eventUrl}
        eventName={event.name}
      />
    </>
  )
}
