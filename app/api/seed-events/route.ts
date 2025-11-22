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
    }
  }

  return NextResponse.json({
    success: true,
    message: `Created ${results.length} events`,
    created: results.length,
    errors: errors.length,
    events: results.map(e => ({ id: e.id, name: e.name })),
    ...(errors.length > 0 && { errors })
  })
}
