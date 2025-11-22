import { createClient } from '@/lib/supabase/server'

async function seedEvents() {
  const supabase = await createClient()

  // Get the authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    console.error('Error: You must be logged in to seed events')
    console.error('Please run this script from a server context with authentication')
    return
  }

  console.log(`Seeding events for user: ${user.email}`)

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
      min_volunteer_hours: 3,
      max_volunteer_hours: 5
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

  console.log('Inserting events...')

  for (const event of testEvents) {
    const { data, error } = await supabase
      .from('events')
      .insert(event)
      .select()
      .single()

    if (error) {
      console.error(`Error inserting event "${event.name}":`, error)
    } else {
      console.log(`✓ Created: ${data.name}`)
    }
  }

  console.log('\nSeeding complete!')
}

seedEvents().catch(console.error)
