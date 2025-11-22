import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE() {
  const supabase = await createClient()

  // Get the authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json(
      { error: 'You must be logged in to delete events' },
      { status: 401 }
    )
  }

  // Define the test event names
  const testEventNames = [
    'Annual Charity Marathon',
    'Community Food Drive',
    'Tech Conference 2025',
    'Beach Cleanup Day',
    'Holiday Gift Wrapping Station',
    'Music Festival Setup',
    'Library Reading Program',
    'Senior Center Bingo Night'
  ]

  // Get test events for this user
  const { data: events, error: fetchError } = await supabase
    .from('events')
    .select('id, name')
    .eq('organizer_id', user.id)
    .in('name', testEventNames)

  if (fetchError) {
    return NextResponse.json(
      { error: 'Failed to fetch events', details: fetchError.message },
      { status: 500 }
    )
  }

  if (!events || events.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No test events to delete',
      deleted: 0,
      events: []
    })
  }

  // Delete only the test events for this user
  const { error: deleteError } = await supabase
    .from('events')
    .delete()
    .eq('organizer_id', user.id)
    .in('name', testEventNames)

  if (deleteError) {
    return NextResponse.json(
      { error: 'Failed to delete events', details: deleteError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    message: `Deleted ${events.length} event(s)`,
    deleted: events.length,
    events: events.map(e => ({ id: e.id, name: e.name }))
  })
}
