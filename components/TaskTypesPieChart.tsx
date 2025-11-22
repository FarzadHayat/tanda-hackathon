'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Event, TaskType, Task } from '@/lib/types/database'

interface TaskTypeData {
  taskTypeId: string | null
  taskTypeName: string
  taskTypeColor: string
  taskCount: number
  totalHours: number
}

interface TaskTypesPieChartProps {
  eventId: string
  event: Event
  initialTaskTypes: TaskType[]
  initialTasks: Task[]
}

export default function TaskTypesPieChart({
  eventId,
  event,
  initialTaskTypes,
  initialTasks
}: TaskTypesPieChartProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [taskTypes, setTaskTypes] = useState<TaskType[]>(initialTaskTypes)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    // Subscribe to real-time updates on tasks
    const tasksChannel = supabase
      .channel(`pie-tasks-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          fetchTasks()
        }
      )
      .subscribe()

    // Subscribe to task types changes
    const typesChannel = supabase
      .channel(`pie-types-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_types',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          fetchTaskTypes()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(tasksChannel)
      supabase.removeChannel(typesChannel)
    }
  }, [eventId])

  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('event_id', eventId)

    if (!error && data) {
      setTasks(data)
    }
  }

  const fetchTaskTypes = async () => {
    const { data, error } = await supabase
      .from('task_types')
      .select('*')
      .eq('event_id', eventId)

    if (!error && data) {
      setTaskTypes(data)
    }
  }

  const taskTypeData = useMemo(() => {
    const dataMap = new Map<string, TaskTypeData>()

    // Initialize with all task types
    taskTypes.forEach(tt => {
      dataMap.set(tt.id, {
        taskTypeId: tt.id,
        taskTypeName: tt.name,
        taskTypeColor: tt.color,
        taskCount: 0,
        totalHours: 0,
      })
    })

    // Add "Uncategorized" for tasks without type
    dataMap.set('uncategorized', {
      taskTypeId: null,
      taskTypeName: 'Uncategorized',
      taskTypeColor: '#9CA3AF',
      taskCount: 0,
      totalHours: 0,
    })

    // Calculate task counts and hours
    tasks.forEach(task => {
      const key = task.task_type_id || 'uncategorized'
      const current = dataMap.get(key)

      if (current) {
        current.taskCount++
        const startTime = new Date(task.start_datetime).getTime()
        const endTime = new Date(task.end_datetime).getTime()
        const hours = (endTime - startTime) / (1000 * 60 * 60)
        current.totalHours += hours
      }
    })

    // Filter out types with no tasks and sort by count
    return Array.from(dataMap.values())
      .filter(d => d.taskCount > 0)
      .sort((a, b) => b.taskCount - a.taskCount)
  }, [tasks, taskTypes])

  const totalTasks = useMemo(() => {
    return taskTypeData.reduce((sum, d) => sum + d.taskCount, 0)
  }, [taskTypeData])

  const totalHours = useMemo(() => {
    return taskTypeData.reduce((sum, d) => sum + d.totalHours, 0)
  }, [taskTypeData])

  // Calculate pie chart segments
  const pieSegments = useMemo(() => {
    if (totalTasks === 0) return []

    let currentAngle = -90 // Start at top

    return taskTypeData.map(data => {
      const percentage = (data.taskCount / totalTasks) * 100
      const angle = (percentage / 100) * 360
      const endAngle = currentAngle + angle

      // Create SVG path for pie segment
      const startAngleRad = (currentAngle * Math.PI) / 180
      const endAngleRad = (endAngle * Math.PI) / 180
      const radius = 80
      const centerX = 100
      const centerY = 100

      const x1 = centerX + radius * Math.cos(startAngleRad)
      const y1 = centerY + radius * Math.sin(startAngleRad)
      const x2 = centerX + radius * Math.cos(endAngleRad)
      const y2 = centerY + radius * Math.sin(endAngleRad)

      const largeArcFlag = angle > 180 ? 1 : 0

      const path = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`

      const segment = {
        ...data,
        percentage,
        path,
        startAngle: currentAngle,
        endAngle,
      }

      currentAngle = endAngle
      return segment
    })
  }, [taskTypeData, totalTasks])

  if (loading) {
    return (
      <div className="bg-gray-50 shadow-lg rounded-xl p-6 border-2 border-gray-200">
        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
          <div className="w-2 h-6 bg-linear-to-b from-purple-600 to-orange-500 rounded-full mr-3"></div>
          Task Types Distribution
        </h3>
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-50 shadow-lg rounded-xl p-6 border-2 border-gray-200 overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-purple-600 to-orange-500"></div>
      <div className="relative z-10">
        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
          <div className="w-2 h-6 bg-linear-to-b from-purple-600 to-orange-500 rounded-full mr-3"></div>
          Task Types Distribution
        </h3>

        {taskTypeData.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-gray-500">No tasks yet</p>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6 items-center">
            {/* Pie Chart */}
            <div className="flex-shrink-0">
              <svg width="200" height="200" viewBox="0 0 200 200" className="transform hover:scale-105 transition-transform">
                {pieSegments.map((segment, index) => (
                  <g key={segment.taskTypeId || 'uncategorized'}>
                    <path
                      d={segment.path}
                      fill={segment.taskTypeColor}
                      stroke="white"
                      strokeWidth="2"
                      className="hover:opacity-80 cursor-pointer transition-opacity"
                    >
                      <title suppressHydrationWarning>
                        {`${segment.taskTypeName}: ${segment.taskCount} tasks (${segment.percentage.toFixed(1)}%)`}
                      </title>
                    </path>
                  </g>
                ))}
              </svg>
              <div className="text-center mt-2">
                <div className="text-2xl font-bold text-gray-900">{totalTasks}</div>
                <div className="text-xs text-gray-500">Total Tasks</div>
              </div>
            </div>

            {/* Legend */}
            <div className="flex-1 space-y-3">
              {taskTypeData.map(data => {
                const percentage = (data.taskCount / totalTasks) * 100
                const hoursPercentage = (data.totalHours / totalHours) * 100

                return (
                  <div
                    key={data.taskTypeId || 'uncategorized'}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    {/* Color indicator */}
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: data.taskTypeColor }}
                    ></div>

                    {/* Name and stats */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {data.taskTypeName}
                        </span>
                        <span className="text-xs font-semibold text-gray-700 flex-shrink-0">
                          {percentage.toFixed(1)}%
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: data.taskTypeColor,
                          }}
                        ></div>
                      </div>

                      {/* Task count and hours */}
                      <div className="flex gap-3 mt-1 text-xs text-gray-500">
                        <span>{data.taskCount} {data.taskCount === 1 ? 'task' : 'tasks'}</span>
                        <span>•</span>
                        <span>{data.totalHours.toFixed(1)}h ({hoursPercentage.toFixed(1)}%)</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Summary stats */}
        {taskTypeData.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-200 flex gap-6 text-sm">
            <div>
              <span className="text-gray-500">Total Tasks:</span>
              <span className="ml-2 font-semibold text-gray-900">{totalTasks}</span>
            </div>
            <div>
              <span className="text-gray-500">Total Hours:</span>
              <span className="ml-2 font-semibold text-gray-900">{totalHours.toFixed(1)}h</span>
            </div>
            <div>
              <span className="text-gray-500">Task Types:</span>
              <span className="ml-2 font-semibold text-gray-900">{taskTypeData.length}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
