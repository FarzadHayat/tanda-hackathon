'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Event, Volunteer, TaskAssignment, Task } from '@/lib/types/database'

interface VolunteerWorkload {
  volunteerId: string
  volunteerName: string
  avatarUrl: string | null
  totalHours: number
}

interface VolunteerWorkloadChartProps {
  eventId: string
  event: Event
}

export default function VolunteerWorkloadChart({ eventId, event }: VolunteerWorkloadChartProps) {
  const [workloadData, setWorkloadData] = useState<VolunteerWorkload[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchWorkloadData()

    // Subscribe to real-time updates on task assignments
    const channel = supabase
      .channel(`workload-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_assignments',
        },
        () => {
          fetchWorkloadData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [eventId])

  const fetchWorkloadData = async () => {
    setLoading(true)
    try {
      // Fetch all volunteers for this event
      const { data: volunteers, error: volunteersError } = await supabase
        .from('volunteers')
        .select('*')
        .eq('event_id', eventId)

      if (volunteersError) throw volunteersError

      // Fetch all tasks for this event
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('event_id', eventId)

      if (tasksError) throw tasksError

      // Fetch all task assignments for this event
      const { data: assignments, error: assignmentsError } = await supabase
        .from('task_assignments')
        .select('*, task:tasks!inner(event_id, start_datetime, end_datetime)')
        .eq('task.event_id', eventId)

      if (assignmentsError) throw assignmentsError

      // Calculate hours per volunteer
      const workloadMap = new Map<string, VolunteerWorkload>()

      volunteers?.forEach((volunteer: Volunteer) => {
        workloadMap.set(volunteer.id, {
          volunteerId: volunteer.id,
          volunteerName: volunteer.name,
          avatarUrl: volunteer.avatar_url || null,
          totalHours: 0,
        })
      })

      assignments?.forEach((assignment: any) => {
        const task = assignment.task
        if (task) {
          const startTime = new Date(task.start_datetime).getTime()
          const endTime = new Date(task.end_datetime).getTime()
          const hours = (endTime - startTime) / (1000 * 60 * 60) // Convert ms to hours

          const current = workloadMap.get(assignment.volunteer_id)
          if (current) {
            current.totalHours += hours
          }
        }
      })

      const workloadArray = Array.from(workloadMap.values()).sort(
        (a, b) => b.totalHours - a.totalHours
      )

      setWorkloadData(workloadArray)
    } catch (error) {
      console.error('Error fetching workload data:', error)
    } finally {
      setLoading(false)
    }
  }

  const maxHours = useMemo(() => {
    return Math.max(...workloadData.map(w => w.totalHours), event.max_volunteer_hours || 0)
  }, [workloadData, event.max_volunteer_hours])

  const chartHeight = 300
  const barWidth = workloadData.length > 0 ? Math.max(40, Math.min(80, 600 / workloadData.length)) : 40

  if (loading) {
    return (
      <div className="bg-gray-50 shadow-lg rounded-xl p-6 border-2 border-gray-200">
        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
          <div className="w-2 h-6 bg-linear-to-b from-purple-600 to-orange-500 rounded-full mr-3"></div>
          Volunteer Workload
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
          Volunteer Workload
        </h3>

        {workloadData.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-gray-500">No volunteers assigned yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              {/* Chart legend */}
              <div className="mb-4 flex gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded"></div>
                  <span>Min: {event.min_volunteer_hours}h</span>
                </div>
                {event.max_volunteer_hours && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded"></div>
                    <span>Max: {event.max_volunteer_hours}h</span>
                  </div>
                )}
              </div>

              {/* Chart container */}
              <div className="relative" style={{ height: chartHeight + 80 }}>
                {/* Y-axis labels and grid lines */}
                <div className="absolute left-0 top-0 bottom-16 w-12 flex flex-col justify-between text-xs text-gray-500">
                  {[...Array(6)].map((_, i) => {
                    const value = Math.round((maxHours * (5 - i)) / 5)
                    return (
                      <div key={i} className="relative">
                        <span className="absolute right-2 -translate-y-1/2">{value}h</span>
                      </div>
                    )
                  })}
                </div>

                {/* Chart area */}
                <div className="absolute left-12 right-0 top-0 bottom-16">
                  {/* Grid lines */}
                  <div className="absolute inset-0">
                    {[...Array(6)].map((_, i) => (
                      <div
                        key={i}
                        className="absolute left-0 right-0 border-t border-gray-200"
                        style={{ top: `${(i * 100) / 5}%` }}
                      ></div>
                    ))}
                  </div>

                  {/* Min hours guideline */}
                  {event.min_volunteer_hours > 0 && (
                    <div
                      className="absolute left-0 right-0 border-t-2 border-green-500 border-dashed"
                      style={{
                        bottom: `${(event.min_volunteer_hours / maxHours) * 100}%`,
                      }}
                    ></div>
                  )}

                  {/* Max hours guideline */}
                  {event.max_volunteer_hours && event.max_volunteer_hours > 0 && (
                    <div
                      className="absolute left-0 right-0 border-t-2 border-red-500 border-dashed"
                      style={{
                        bottom: `${(event.max_volunteer_hours / maxHours) * 100}%`,
                      }}
                    ></div>
                  )}

                  {/* Bars */}
                  <div className="absolute inset-0 flex items-end justify-start gap-2 px-4">
                    {workloadData.map((volunteer) => {
                      const barHeight = maxHours > 0 ? (volunteer.totalHours / maxHours) * 100 : 0
                      const isUnderMin = volunteer.totalHours < event.min_volunteer_hours
                      const isOverMax =
                        event.max_volunteer_hours && volunteer.totalHours > event.max_volunteer_hours

                      let barColor = 'bg-blue-500'
                      if (isOverMax) barColor = 'bg-red-500'
                      else if (isUnderMin) barColor = 'bg-yellow-500'
                      else barColor = 'bg-green-500'

                      return (
                        <div
                          key={volunteer.volunteerId}
                          className="flex flex-col items-center"
                          style={{ width: barWidth }}
                        >
                          <div className="relative w-full" style={{ height: chartHeight }}>
                            <div
                              className={`absolute bottom-0 w-full ${barColor} rounded-t-md transition-all hover:opacity-80 cursor-pointer group`}
                              style={{ height: `${barHeight}%` }}
                              title={`${volunteer.volunteerName}: ${volunteer.totalHours.toFixed(1)} hours`}
                            >
                              {/* Tooltip on hover */}
                              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                                {volunteer.totalHours.toFixed(1)}h
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* X-axis labels (volunteer names with avatars) */}
                <div className="absolute left-12 right-0 bottom-0 h-16">
                  <div className="flex items-start justify-start gap-2 px-4 pt-2">
                    {workloadData.map((volunteer) => (
                      <div
                        key={volunteer.volunteerId}
                        className="flex flex-col items-center gap-1"
                        style={{ width: barWidth }}
                        title={volunteer.volunteerName}
                      >
                        {volunteer.avatarUrl ? (
                          <img
                            src={volunteer.avatarUrl}
                            alt={volunteer.volunteerName}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium text-gray-700">
                            {volunteer.volunteerName.split(' ').map(s => s[0]).slice(0, 2).join('')}
                          </div>
                        )}
                        <span className="text-xs text-gray-600 truncate w-full text-center">
                          {volunteer.volunteerName}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
