'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const USER_UUID_STORAGE_KEY = 'spreadz_user_uuid'

type MutedUsersSectionProps = {
  className?: string
}

type MutedUser = {
  id: string
  displayName: string
  username: string
}

export function MutedUsersSection({ className = '' }: MutedUsersSectionProps) {
  const [mutedUsers, setMutedUsers] = useState<MutedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [busyUserId, setBusyUserId] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const loadMutedUsers = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')

    const currentUserId = typeof window === 'undefined'
      ? ''
      : localStorage.getItem(USER_UUID_STORAGE_KEY)?.trim() || ''

    if (!currentUserId) {
      setMutedUsers([])
      setLoading(false)
      return
    }

    const { data: muteRows, error: muteError } = await supabase
      .from('mutes')
      .select('muted_id, created_at')
      .eq('muter_id', currentUserId)
      .order('created_at', { ascending: false })

    if (muteError) {
      console.error('[Mutes] about fetch failed:', muteError)
      setMutedUsers([])
      setErrorMessage('Could not load muted people right now.')
      setLoading(false)
      return
    }

    const mutedIds = (muteRows || [])
      .map((row) => row.muted_id)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

    if (mutedIds.length === 0) {
      setMutedUsers([])
      setLoading(false)
      return
    }

    const { data: userRows, error: userError } = await supabase
      .from('users')
      .select('uuid, display_name, username')
      .in('uuid', mutedIds)

    if (userError) {
      console.error('[Mutes] muted users lookup failed:', userError)
      setMutedUsers(
        mutedIds.map((id) => ({
          id,
          displayName: 'Unknown user',
          username: '',
        }))
      )
      setLoading(false)
      return
    }

    const userMap = new Map(
      (userRows || []).map((row) => [
        row.uuid,
        {
          displayName: row.display_name?.trim() || row.username?.trim() || 'Unknown user',
          username: row.username?.trim() ? `@${row.username.trim().replace(/^@/, '')}` : '',
        },
      ])
    )

    setMutedUsers(
      mutedIds.map((id) => ({
        id,
        displayName: userMap.get(id)?.displayName || 'Unknown user',
        username: userMap.get(id)?.username || '',
      }))
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadMutedUsers()
  }, [loadMutedUsers])

  const handleUnmute = useCallback(async (mutedUserId: string) => {
    const currentUserId = typeof window === 'undefined'
      ? ''
      : localStorage.getItem(USER_UUID_STORAGE_KEY)?.trim() || ''

    if (!currentUserId || !mutedUserId) return

    setBusyUserId(mutedUserId)
    setErrorMessage('')

    const { error } = await supabase
      .from('mutes')
      .delete()
      .eq('muter_id', currentUserId)
      .eq('muted_id', mutedUserId)

    if (error) {
      console.error('[Mutes] unmute failed:', error)
      setErrorMessage('Could not unmute right now.')
      setBusyUserId('')
      return
    }

    setMutedUsers((prev) => prev.filter((user) => user.id !== mutedUserId))
    setBusyUserId('')
  }, [])

  return (
    <div className={className}>
      {loading && <div className="mt-6 text-sm text-white/45">Loading...</div>}

      {!loading && mutedUsers.length === 0 && (
        <div className="flex min-h-[45vh] items-center justify-center text-center text-[15px] text-white/40">
          No one muted yet
        </div>
      )}

      {!loading && mutedUsers.length > 0 && (
        <div className="mt-6 divide-y divide-white/10 border-t border-white/10">
          {mutedUsers.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between gap-3 py-4"
            >
              <div className="min-w-0 flex-1 pr-3">
                <div className="truncate text-[16px] font-semibold tracking-[-0.01em] text-white">{user.displayName}</div>
                {user.username && <div className="mt-1 truncate text-sm text-white/40">{user.username}</div>}
              </div>
              <button
                type="button"
                className="shrink-0 rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-white/75 active:bg-[rgba(255,255,255,0.08)]"
                onClick={() => handleUnmute(user.id)}
                disabled={busyUserId === user.id}
              >
                {busyUserId === user.id ? 'Unmuting...' : 'Unmute'}
              </button>
            </div>
          ))}
        </div>
      )}

      {errorMessage && <div className="mt-4 text-sm text-rose-300">{errorMessage}</div>}
    </div>
  )
}
