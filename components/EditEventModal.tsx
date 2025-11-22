'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Event } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'

interface EditEventModalProps {
  event: Event
  isOpen: boolean
  onClose: () => void
}

export default function EditEventModal({ event, isOpen, onClose }: EditEventModalProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(event.name)
  const [description, setDescription] = useState(event.description || '')
  const [startDate, setStartDate] = useState(event.start_date)
  const [endDate, setEndDate] = useState(event.end_date)
  const [minVolunteerHours, setMinVolunteerHours] = useState(event.min_volunteer_hours)
  const [maxVolunteerHours, setMaxVolunteerHours] = useState(event.max_volunteer_hours || '')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Check if any tasks would fall outside the new date range
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select('id, name, start_datetime, end_datetime')
        .eq('event_id', event.id)

      if (tasksError) throw tasksError

      if (tasks && tasks.length > 0) {
        const newStartDate = new Date(startDate)
        newStartDate.setHours(0, 0, 0, 0)
        const newEndDate = new Date(endDate)
        newEndDate.setHours(23, 59, 59, 999)

        const tasksOutsideRange = tasks.filter(task => {
          const taskStart = new Date(task.start_datetime)
          const taskEnd = new Date(task.end_datetime)
          return taskStart < newStartDate || taskEnd > newEndDate
        })

        if (tasksOutsideRange.length > 0) {
          const maxNamesToShow = 5
          const taskNames = tasksOutsideRange
            .slice(0, maxNamesToShow)
            .map(t => `"${t.name}"`)
            .join(', ')
          const moreCount = tasksOutsideRange.length - maxNamesToShow
          const nameList = moreCount > 0
            ? `${taskNames}, and ${moreCount} more`
            : taskNames

          throw new Error(
            `Cannot shrink event dates: ${tasksOutsideRange.length} task(s) would fall outside the new date range: ${nameList}. Please delete or modify these tasks first.`
          )
        }
      }

      const { error: updateError } = await supabase
        .from('events')
        .update({
          name,
          description,
          start_date: startDate,
          end_date: endDate,
          min_volunteer_hours: minVolunteerHours,
          max_volunteer_hours: maxVolunteerHours ? parseInt(maxVolunteerHours.toString()) : null,
        })
        .eq('id', event.id)

      if (updateError) throw updateError

      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update event')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-900">
            Edit Event
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-4 border-l-4 border-red-400">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700 break-words">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Event Name *
              </label>
              <input
                type="text"
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-md text-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                placeholder="e.g., Annual Charity Marathon"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-md text-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                placeholder="Describe your event..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="start_date" className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  id="start_date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-md text-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                />
              </div>

              <div>
                <label htmlFor="end_date" className="block text-sm font-medium text-gray-700 mb-1">
                  End Date *
                </label>
                <input
                  type="date"
                  id="end_date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-md text-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="min_volunteer_hours" className="block text-sm font-medium text-gray-700 mb-1">
                  Minimum Volunteer Hours Goal *
                </label>
                <input
                  type="number"
                  id="min_volunteer_hours"
                  required
                  min="0"
                  value={minVolunteerHours}
                  onChange={(e) => setMinVolunteerHours(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-md text-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                  placeholder="e.g., 2"
                />
              </div>

              <div>
                <label htmlFor="max_volunteer_hours" className="block text-sm font-medium text-gray-700 mb-1">
                  Maximum Volunteer Hours Limit (optional)
                </label>
                <input
                  type="number"
                  id="max_volunteer_hours"
                  min="0"
                  value={maxVolunteerHours}
                  onChange={(e) => setMaxVolunteerHours(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-md text-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                  placeholder="e.g., 8"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-linear-to-r from-orange-500 to-purple-600 text-white text-sm rounded-md hover:from-orange-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 text-sm rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
