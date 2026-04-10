'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function deleteAccount() {
  try {
    const supabase = await createClient()

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      throw new Error('User not authenticated')
    }

    const userId = user.id

    // Start a transaction to delete all user data
    const { error: deleteError } = await supabase.rpc('delete_user_account', {
      user_id: userId
    })

    if (deleteError) {
      console.error('Error deleting user account:', deleteError)
      throw new Error('Failed to delete account')
    }

    // Sign out the user
    await supabase.auth.signOut()

    // Redirect to home page
    redirect('/')
  } catch (error) {
    console.error('Delete account error:', error)
    throw error
  }
} 