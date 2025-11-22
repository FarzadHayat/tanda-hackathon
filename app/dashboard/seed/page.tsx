'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SeedPage() {
  const [loading, setLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [deleteResult, setDeleteResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSeed = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    setDeleteResult(null)

    try {
      const response = await fetch('/api/seed-events', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to seed events')
      }

      setResult(data)

      // Redirect to dashboard after a delay
      setTimeout(() => {
        router.push('/dashboard')
      }, 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteAll = async () => {
    if (!confirm('Are you sure you want to delete all test events? This action cannot be undone!')) {
      return
    }

    setDeleteLoading(true)
    setError(null)
    setResult(null)
    setDeleteResult(null)

    try {
      const response = await fetch('/api/delete-all-events', {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete events')
      }

      setDeleteResult(data)

      // Redirect to dashboard after a delay
      setTimeout(() => {
        router.push('/dashboard')
      }, 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Manage Test Events
        </h1>

        <p className="text-gray-600 mb-6">
          Create 8 test events for testing and demonstration purposes, or delete all test events to start fresh.
        </p>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {result && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-700 font-medium mb-2">
              Success! Created {result.created} events
            </p>
            {result.events && result.events.length > 0 && (
              <ul className="text-xs text-green-600 space-y-1">
                {result.events.map((event: any) => (
                  <li key={event.id}>✓ {event.name}</li>
                ))}
              </ul>
            )}
            <p className="text-xs text-green-600 mt-3">
              Redirecting to dashboard...
            </p>
          </div>
        )}

        {deleteResult && (
          <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-md">
            <p className="text-sm text-orange-700 font-medium mb-2">
              {deleteResult.deleted > 0
                ? `Deleted ${deleteResult.deleted} event(s)`
                : 'No events to delete'
              }
            </p>
            {deleteResult.events && deleteResult.events.length > 0 && (
              <ul className="text-xs text-orange-600 space-y-1 max-h-40 overflow-y-auto">
                {deleteResult.events.map((event: any) => (
                  <li key={event.id}>✗ {event.name}</li>
                ))}
              </ul>
            )}
            {deleteResult.deleted > 0 && (
              <p className="text-xs text-orange-600 mt-3">
                Redirecting to dashboard...
              </p>
            )}
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={handleSeed}
            disabled={loading || deleteLoading || !!result || !!deleteResult}
            className="w-full px-4 py-3 bg-linear-to-r from-orange-600 to-purple-700 text-white rounded-md hover:from-orange-700 hover:to-purple-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? 'Creating Events...' : result ? 'Events Created!' : 'Create Test Events'}
          </button>

          <button
            onClick={handleDeleteAll}
            disabled={loading || deleteLoading || !!result || !!deleteResult}
            className="w-full px-4 py-3 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {deleteLoading ? 'Deleting Test Events...' : deleteResult ? 'Test Events Deleted!' : 'Delete Test Events'}
          </button>

          <Link
            href="/dashboard"
            className="block w-full px-4 py-3 text-center border-2 border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
