import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createClient()

  // Get the authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json(
      { error: 'You must be logged in to seed events' },
      { status: 401 }
    )
  }

  const today = new Date()
  const testEvents = [
    {
      organizer_id: user.id,
      name: 'Annual Charity Marathon',
      description: 'Join us for our biggest fundraising event of the year! We need volunteers for registration, water stations, and finish line support.',
      start_date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5).toISOString().split('T')[0],
      end_date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5).toISOString().split('T')[0],
      min_volunteer_hours: 4,
      max_volunteer_hours: 8
    },
    {
      organizer_id: user.id,
      name: 'Community Food Drive',
      description: 'Help us collect and distribute food to families in need. Multiple shifts available throughout the week.',
      start_date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10).toISOString().split('T')[0],
      end_date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 17).toISOString().split('T')[0],
      min_volunteer_hours: 3,
      max_volunteer_hours: 12
    },
    {
      organizer_id: user.id,
      name: 'Tech Conference 2025',
      description: 'Annual technology conference featuring speakers, workshops, and networking events. Need help with registration, setup, and attendee support.',
      start_date: new Date(today.getFullYear(), today.getMonth() + 1, 15).toISOString().split('T')[0],
      end_date: new Date(today.getFullYear(), today.getMonth() + 1, 17).toISOString().split('T')[0],
      min_volunteer_hours: 6,
      max_volunteer_hours: 16
    },
    {
      organizer_id: user.id,
      name: 'Beach Cleanup Day',
      description: 'Join environmental volunteers to clean up our local beaches. All supplies provided.',
      start_date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 20).toISOString().split('T')[0],
      end_date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 20).toISOString().split('T')[0],
      min_volunteer_hours: 2,
      max_volunteer_hours: 4
    },
    {
      organizer_id: user.id,
      name: 'Holiday Gift Wrapping Station',
      description: 'Help wrap gifts for underprivileged children during the holiday season. Fun and festive atmosphere!',
      start_date: new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().split('T')[0],
      end_date: new Date(today.getFullYear(), today.getMonth() + 1, 14).toISOString().split('T')[0],
      min_volunteer_hours: 2,
      max_volunteer_hours: 6
    },
    {
      organizer_id: user.id,
      name: 'Music Festival Setup',
      description: 'Large outdoor music festival needs volunteers for stage setup, vendor coordination, and crowd management.',
      start_date: new Date(today.getFullYear(), today.getMonth() + 2, 5).toISOString().split('T')[0],
      end_date: new Date(today.getFullYear(), today.getMonth() + 2, 7).toISOString().split('T')[0],
      min_volunteer_hours: 8,
      max_volunteer_hours: 20
    },
    {
      organizer_id: user.id,
      name: 'Library Reading Program',
      description: 'Help children develop reading skills through our weekly tutoring program. Training provided.',
      start_date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7).toISOString().split('T')[0],
      end_date: new Date(today.getFullYear(), today.getMonth() + 2, today.getDate() + 7).toISOString().split('T')[0],
      min_volunteer_hours: 5,
      max_volunteer_hours: null
    },
    {
      organizer_id: user.id,
      name: 'Senior Center Bingo Night',
      description: 'Monthly social event for seniors. Help with setup, calling numbers, and serving refreshments.',
      start_date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14).toISOString().split('T')[0],
      end_date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14).toISOString().split('T')[0],
      min_volunteer_hours: 3,
      max_volunteer_hours: 5
    }
  ]

  const results = []
  const errors = []
  let techConferenceEvent = null

  for (const event of testEvents) {
    const { data, error } = await supabase
      .from('events')
      .insert(event)
      .select()
      .single()

    if (error) {
      errors.push({ event: event.name, error: error.message })
    } else {
      results.push(data)
      // Save the Tech Conference event for adding tasks
      if (event.name === 'Tech Conference 2025') {
        techConferenceEvent = data
      }
    }
  }

  // Add tasks to Tech Conference event
  if (techConferenceEvent) {
    const taskTypesData = [
      { event_id: techConferenceEvent.id, name: 'Registration', color: '#3B82F6' }, // Blue
      { event_id: techConferenceEvent.id, name: 'Setup', color: '#10B981' }, // Green
      { event_id: techConferenceEvent.id, name: 'Cleanup', color: '#F59E0B' }, // Amber
      { event_id: techConferenceEvent.id, name: 'Catering', color: '#EC4899' }, // Pink
      { event_id: techConferenceEvent.id, name: 'Airport Pickup', color: '#8B5CF6' }, // Purple
    ]

    const { data: taskTypes, error: taskTypesError } = await supabase
      .from('task_types')
      .insert(taskTypesData)
      .select()

    if (taskTypesError) {
      errors.push({ event: 'Tech Conference Task Types', error: taskTypesError.message })
    } else {
      const taskTypeMap: Record<string, string> = {}
      taskTypes.forEach(tt => {
        taskTypeMap[tt.name] = tt.id
      })

      const tasks = []
      const eventStartDate = new Date(techConferenceEvent.start_date)
      const eventEndDate = new Date(techConferenceEvent.end_date)

      // Calculate number of days
      const daysDiff = Math.floor((eventEndDate.getTime() - eventStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

      // Create registration tasks: one every hour from 10am to 11pm for each day
      for (let day = 0; day < daysDiff; day++) {
        for (let hour = 10; hour <= 22; hour++) {
          const taskDate = new Date(eventStartDate)
          taskDate.setDate(eventStartDate.getDate() + day)
          taskDate.setHours(hour, 0, 0, 0)

          const taskEndDate = new Date(taskDate)
          taskEndDate.setHours(hour + 1, 0, 0, 0)

          tasks.push({
            event_id: techConferenceEvent.id,
            task_type_id: taskTypeMap['Registration'],
            name: `Registration Desk - Hour ${hour}`,
            description: 'Check in attendees, distribute badges and welcome packets',
            start_datetime: taskDate.toISOString(),
            end_datetime: taskEndDate.toISOString(),
            volunteers_required: hour >= 8 && hour <= 18 ? 3 : 2, // More volunteers during peak hours
            location: 'Main Entrance - Registration Area'
          })
        }
      }

      // Add setup tasks (scattered throughout early mornings of each day)
      for (let day = 0; day < daysDiff; day++) {
        // Morning setup
        const setupDate = new Date(eventStartDate)
        setupDate.setDate(eventStartDate.getDate() + day)
        setupDate.setHours(7, 0, 0, 0)
        const setupEndDate = new Date(setupDate)
        setupEndDate.setHours(9, 0, 0, 0)

        tasks.push({
          event_id: techConferenceEvent.id,
          task_type_id: taskTypeMap['Setup'],
          name: `Day ${day + 1} - Morning Setup`,
          description: 'Set up chairs, tables, equipment, and signage',
          start_datetime: setupDate.toISOString(),
          end_datetime: setupEndDate.toISOString(),
          volunteers_required: 6,
          location: 'Conference Hall'
        })
      }

      // Add cleanup tasks (scattered throughout late evenings)
      for (let day = 0; day < daysDiff; day++) {
        const cleanupDate = new Date(eventStartDate)
        cleanupDate.setDate(eventStartDate.getDate() + day)
        cleanupDate.setHours(20, 0, 0, 0)
        const cleanupEndDate = new Date(cleanupDate)
        cleanupEndDate.setHours(22, 0, 0, 0)

        tasks.push({
          event_id: techConferenceEvent.id,
          task_type_id: taskTypeMap['Cleanup'],
          name: `Day ${day + 1} - Evening Cleanup`,
          description: 'Clean up venue, remove trash, organize equipment',
          start_datetime: cleanupDate.toISOString(),
          end_datetime: cleanupEndDate.toISOString(),
          volunteers_required: 4,
          location: 'Conference Hall'
        })
      }

      // Add catering tasks (lunch and dinner for each day)
      for (let day = 0; day < daysDiff; day++) {
        // Lunch catering
        const lunchDate = new Date(eventStartDate)
        lunchDate.setDate(eventStartDate.getDate() + day)
        lunchDate.setHours(11, 30, 0, 0)
        const lunchEndDate = new Date(lunchDate)
        lunchEndDate.setHours(13, 30, 0, 0)

        tasks.push({
          event_id: techConferenceEvent.id,
          task_type_id: taskTypeMap['Catering'],
          name: `Day ${day + 1} - Lunch Service`,
          description: 'Help serve lunch, manage buffet stations, and clean up',
          start_datetime: lunchDate.toISOString(),
          end_datetime: lunchEndDate.toISOString(),
          volunteers_required: 5,
          location: 'Dining Area'
        })

        // Dinner catering
        const dinnerDate = new Date(eventStartDate)
        dinnerDate.setDate(eventStartDate.getDate() + day)
        dinnerDate.setHours(18, 0, 0, 0)
        const dinnerEndDate = new Date(dinnerDate)
        dinnerEndDate.setHours(20, 0, 0, 0)

        tasks.push({
          event_id: techConferenceEvent.id,
          task_type_id: taskTypeMap['Catering'],
          name: `Day ${day + 1} - Dinner Service`,
          description: 'Help serve dinner, manage buffet stations, and clean up',
          start_datetime: dinnerDate.toISOString(),
          end_datetime: dinnerEndDate.toISOString(),
          volunteers_required: 5,
          location: 'Dining Area'
        })
      }

      // Add airport pickup tasks (scattered throughout the first day and last day)
      const airportPickups = [
        { day: 0, hour: 8, duration: 2, description: 'Pick up VIP speakers from airport' },
        { day: 0, hour: 11, duration: 2, description: 'Pick up speakers and panelists from airport' },
        { day: 0, hour: 14, duration: 2, description: 'Pick up international attendees from airport' },
        { day: 0, hour: 17, duration: 2, description: 'Pick up late-arriving speakers from airport' },
        { day: daysDiff - 1, hour: 14, duration: 3, description: 'Drop off speakers at airport' },
        { day: daysDiff - 1, hour: 18, duration: 3, description: 'Drop off VIP guests at airport' },
      ]

      airportPickups.forEach((pickup, idx) => {
        const pickupDate = new Date(eventStartDate)
        pickupDate.setDate(eventStartDate.getDate() + pickup.day)
        pickupDate.setHours(pickup.hour, 0, 0, 0)
        const pickupEndDate = new Date(pickupDate)
        pickupEndDate.setHours(pickup.hour + pickup.duration, 0, 0, 0)

        tasks.push({
          event_id: techConferenceEvent.id,
          task_type_id: taskTypeMap['Airport Pickup'],
          name: `Airport Transport - Slot ${idx + 1}`,
          description: pickup.description,
          start_datetime: pickupDate.toISOString(),
          end_datetime: pickupEndDate.toISOString(),
          volunteers_required: pickup.description.includes('VIP') ? 2 : 1,
          location: 'Airport / Hotel'
        })
      })

      // Insert all tasks
      const { error: tasksError } = await supabase
        .from('tasks')
        .insert(tasks)

      if (tasksError) {
        errors.push({ event: 'Tech Conference Tasks', error: tasksError.message })
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: `Created ${results.length} events${techConferenceEvent ? ' with tasks for Tech Conference 2025' : ''}`,
    created: results.length,
    errors: errors.length,
    events: results.map(e => ({ id: e.id, name: e.name })),
    ...(errors.length > 0 && { errors })
  })
}
