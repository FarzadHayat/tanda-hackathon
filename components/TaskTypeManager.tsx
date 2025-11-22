'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TaskType } from '@/lib/types/database'
import { useRouter } from 'next/navigation'

interface TaskTypeManagerProps {
  eventId: string
  initialTaskTypes: TaskType[]
}

export default function TaskTypeManager({ eventId, initialTaskTypes }: TaskTypeManagerProps) {
  const [taskTypes, setTaskTypes] = useState<TaskType[]>(initialTaskTypes)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#F97316')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { data, error } = await supabase
        .from('task_types')
        .insert({
          event_id: eventId,
          name,
          color,
        })
        .select()
        .single()

      if (error) throw error

      setTaskTypes([...taskTypes, data])
      setName('')
      setColor('#F97316')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this task type?')) return

    try {
      const { error } = await supabase
        .from('task_types')
        .delete()
        .eq('id', id)

      if (error) throw error

      setTaskTypes(taskTypes.filter(tt => tt.id !== id))
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  return (
    <div className="relative bg-gray-50 shadow-lg rounded-xl p-6 border-2 border-gray-200 overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-orange-500 to-purple-600"></div>
      <div className="absolute bottom-0 right-0 w-20 h-20 bg-linear-to-tl from-orange-50 to-transparent rounded-tl-full opacity-30"></div>
      <div className="relative z-10">
        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
          <div className="w-2 h-6 bg-linear-to-b from-orange-500 to-purple-600 rounded-full mr-3"></div>
          Task Types
        </h3>

        <form onSubmit={handleSubmit} className="mb-6">
          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Task type name"
              required
              className="flex-1 px-3 py-2 border-2 border-gray-300 rounded-md text-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-16 h-10 border-2 border-gray-300 rounded-md cursor-pointer p-0"
              title="Choose color"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-linear-to-r from-orange-500 to-purple-600 text-white text-sm rounded-md hover:from-orange-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
        </form>

        <div className="space-y-2">
          {taskTypes.length === 0 ? (
            <p className="text-sm text-gray-500">No task types yet</p>
          ) : (
            taskTypes.map((taskType) => (
              <div
                key={taskType.id}
                className="flex items-center justify-between p-3 bg-white rounded-md shadow-sm border-2 border-gray-300"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: taskType.color }}
                  />
                  <span className="text-sm font-medium text-gray-900">
                    {taskType.name}
                  </span>
                </div>
                <button
                  onClick={() => handleDelete(taskType.id)}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
