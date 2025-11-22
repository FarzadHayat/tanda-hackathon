'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Task, TaskType, Event } from '@/lib/types/database'
import { useRouter } from 'next/navigation'

interface TaskManagerProps {
  eventId: string
  event: Event
  taskTypes: TaskType[]
  initialTasks: Task[]
}

export default function TaskManager({ eventId, event, taskTypes, initialTasks }: TaskManagerProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [showForm, setShowForm] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [volunteersRequired, setVolunteersRequired] = useState(1)
  const [taskTypeId, setTaskTypeId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const resetForm = () => {
    setName('')
    setDescription('')
    setStartDate('')
    setStartTime('')
    setEndDate('')
    setEndTime('')
    setVolunteersRequired(1)
    setTaskTypeId('')
    setEditingTaskId(null)
    setShowForm(false)
    setError(null)
  }

  const handleEdit = (task: Task) => {
    // Parse datetime into date and time components
    const startDT = new Date(task.start_datetime)
    const endDT = new Date(task.end_datetime)

    const formatDate = (date: Date) => date.toISOString().split('T')[0]
    const formatTime = (date: Date) => date.toTimeString().slice(0, 5)

    setName(task.name)
    setDescription(task.description || '')
    setStartDate(formatDate(startDT))
    setStartTime(formatTime(startDT))
    setEndDate(formatDate(endDT))
    setEndTime(formatTime(endDT))
    setVolunteersRequired(task.volunteers_required)
    setTaskTypeId(task.task_type_id || '')
    setEditingTaskId(task.id)
    setShowForm(true)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // Combine date and time into datetime strings
      const startDatetime = `${startDate}T${startTime}`
      const endDatetime = `${endDate}T${endTime}`

      if (new Date(endDatetime) <= new Date(startDatetime)) {
        throw new Error('End time must be after start time')
      }

      // Validate task is within event date range
      const taskStart = new Date(startDatetime)
      const taskEnd = new Date(endDatetime)
      const eventStart = new Date(event.start_date)
      const eventEnd = new Date(event.end_date)
      eventEnd.setHours(23, 59, 59, 999) // Set to end of day

      if (taskStart < eventStart || taskEnd > eventEnd) {
        throw new Error('Task must be within event date range')
      }

      // Convert datetime to ISO string with timezone
      const startISO = new Date(startDatetime).toISOString()
      const endISO = new Date(endDatetime).toISOString()

      const taskData = {
        event_id: eventId,
        task_type_id: taskTypeId || null,
        name,
        description,
        start_datetime: startISO,
        end_datetime: endISO,
        volunteers_required: volunteersRequired,
      }

      if (editingTaskId) {
        // Update existing task
        const { data, error } = await supabase
          .from('tasks')
          .update(taskData)
          .eq('id', editingTaskId)
          .select()
          .single()

        if (error) throw error

        setTasks(tasks.map(t => t.id === editingTaskId ? data : t))
      } else {
        // Create new task
        const { data, error } = await supabase
          .from('tasks')
          .insert(taskData)
          .select()
          .single()

        if (error) throw error

        setTasks([...tasks, data])
      }

      resetForm()
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return

    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id)

      if (error) throw error

      setTasks(tasks.filter(t => t.id !== id))
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  return (
    <div className="relative bg-gray-50 shadow-lg rounded-xl p-6 border-2 border-gray-200 overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-purple-600 to-orange-500"></div>
      <div className="absolute bottom-0 right-0 w-20 h-20 bg-linear-to-tl from-purple-50 to-transparent rounded-tl-full opacity-30"></div>
      <div className="relative z-10">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-900 flex items-center">
            <div className="w-2 h-6 bg-linear-to-b from-purple-600 to-orange-500 rounded-full mr-3"></div>
            Tasks
          </h3>
        <button
          onClick={() => showForm ? resetForm() : setShowForm(true)}
          className="px-4 py-2 bg-linear-to-r from-orange-500 to-purple-600 text-white text-sm rounded-md hover:from-orange-600 hover:to-purple-700"
        >
          {showForm ? 'Cancel' : 'Add Task'}
          </button>
        </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 p-5 bg-white rounded-lg shadow-sm border border-gray-200">
          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Task Name *
              </label>
              <input
                type="text"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Task Type
              </label>
              <select
                value={taskTypeId}
                onChange={(e) => setTaskTypeId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
              >
                <option value="">No type</option>
                {taskTypes.map((tt) => (
                  <option key={tt.id} value={tt.id}>
                    {tt.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date & Time *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    required
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <input
                    type="time"
                    required
                    step="60"
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date & Time *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    required
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                  <input
                    type="time"
                    required
                    step="60"
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Volunteers Required *
              </label>
              <input
                type="number"
                min="1"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                value={volunteersRequired}
                onChange={(e) => setVolunteersRequired(parseInt(e.target.value))}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 bg-linear-to-r from-orange-500 to-purple-600 text-white text-sm rounded-md hover:from-orange-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (editingTaskId ? 'Updating...' : 'Creating...') : (editingTaskId ? 'Update Task' : 'Create Task')}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {tasks.length === 0 ? (
          <p className="text-sm text-gray-500">No tasks yet</p>
        ) : (
          tasks.map((task) => {
            const taskType = taskTypes.find(tt => tt.id === task.task_type_id)
            return (
              <div
                key={task.id}
                className="p-4 bg-white rounded-lg border-l-4 shadow-sm"
                style={{ borderLeftColor: taskType?.color || '#9CA3AF' }}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-gray-900">{task.name}</h4>
                    {taskType && (
                      <span className="text-xs text-gray-600">{taskType.name}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(task)}
                      className="text-sm text-orange-600 hover:text-orange-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {task.description && (
                  <p className="text-xs text-gray-600 mb-2">{task.description}</p>
                )}
                <div className="text-xs text-gray-500">
                  <p>
                    {new Date(task.start_datetime).toLocaleString()} -{' '}
                    {new Date(task.end_datetime).toLocaleString()}
                  </p>
                  <p>Volunteers needed: {task.volunteers_required}</p>
                </div>
              </div>
            )
          })
        )}
      </div>
      </div>
    </div>
  )
}
