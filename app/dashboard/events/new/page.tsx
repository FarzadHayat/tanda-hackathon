'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function NewEventPage() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [minVolunteerHours, setMinVolunteerHours] = useState('0')
  const [maxVolunteerHours, setMaxVolunteerHours] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Not authenticated')
      }

      if (new Date(endDate) < new Date(startDate)) {
        throw new Error('End date must be after start date')
      }

      const minHours = parseFloat(minVolunteerHours) || 0
      const maxHours = maxVolunteerHours ? parseFloat(maxVolunteerHours) : null

      if (maxHours !== null && minHours > maxHours) {
        throw new Error('Minimum hours cannot exceed maximum hours')
      }

      const { data, error } = await supabase
        .from('events')
        .insert({
          organizer_id: user.id,
          name,
          description,
          start_date: startDate,
          end_date: endDate,
          min_volunteer_hours: minHours,
          max_volunteer_hours: maxHours,
        })
        .select()
        .single()

      if (error) throw error

      router.push(`/dashboard/events/${data.id}`)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

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

      <main className="max-w-3xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <Link
              href="/dashboard"
              className="text-sm text-orange-600 hover:text-orange-800"
            >
              &larr; Back to Dashboard
            </Link>
          </div>

          <div className="relative bg-gray-50 shadow-lg rounded-xl p-6 border-2 border-gray-200 overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-linear-to-r from-orange-500 to-purple-600"></div>
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-linear-to-tl from-orange-50 to-transparent rounded-tl-full opacity-30"></div>
            <div className="relative z-10">
              <h2 className="text-3xl font-bold mb-6 bg-linear-to-r from-orange-600 to-purple-600 bg-clip-text text-transparent">
                Create New Event
              </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="rounded-md bg-red-50 p-4">
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              )}

              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700"
                >
                  Event Name *
                </label>
                <input
                  type="text"
                  id="name"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-gray-700"
                >
                  Description
                </label>
                <textarea
                  id="description"
                  rows={4}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="startDate"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Start Date *
                  </label>
                  <input
                    type="date"
                    id="startDate"
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                <div>
                  <label
                    htmlFor="endDate"
                    className="block text-sm font-medium text-gray-700"
                  >
                    End Date *
                  </label>
                  <input
                    type="date"
                    id="endDate"
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6 mt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Volunteer Hour Limits</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="minHours"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Minimum Hours (Goal)
                    </label>
                    <input
                      type="number"
                      id="minHours"
                      min="0"
                      step="0.5"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                      value={minVolunteerHours}
                      onChange={(e) => setMinVolunteerHours(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Recommended hours for fair contribution
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="maxHours"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Maximum Hours (Hard Limit)
                    </label>
                    <input
                      type="number"
                      id="maxHours"
                      min="0"
                      step="0.5"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                      value={maxVolunteerHours}
                      onChange={(e) => setMaxVolunteerHours(e.target.value)}
                      placeholder="No limit"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Prevents volunteers from exceeding this
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 inline-flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-linear-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Creating...' : 'Create Event'}
                </button>
                <Link
                  href="/dashboard"
                  className="flex-1 inline-flex justify-center py-2 px-4 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                >
                  Cancel
                </Link>
              </div>
            </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
