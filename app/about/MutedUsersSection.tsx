'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const USER_UUID_STORAGE_KEY = 'spreadz_user_uuid'

type MutedUser = {
  id: string
  displayName: string
  username: string
}

export function MutedUsersSection() {
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
    <div className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Muted people</div>
      <div className="mt-2 text-sm text-slate-500">People you muted will show up here.</div>

      {loading && <div className="mt-4 text-sm text-slate-500">Loading...</div>}
      {!loading && mutedUsers.length === 0 && <div className="mt-4 text-sm text-slate-500">No muted people.</div>}

      {!loading && mutedUsers.length > 0 && (
        <div className="mt-4 space-y-3">
          {mutedUsers.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold text-slate-900">{user.displayName}</div>
                {user.username && <div className="truncate text-sm text-slate-500">{user.username}</div>}
              </div>
              <button
                type="button"
                className="shrink-0 rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition active:scale-[0.98]"
                onClick={() => handleUnmute(user.id)}
                disabled={busyUserId === user.id}
              >
                {busyUserId === user.id ? 'Unmuting...' : 'Unmute'}
              </button>
            </div>
          ))}
        </div>
      )}

      {errorMessage && <div className="mt-3 text-sm text-rose-500">{errorMessage}</div>}
    </div>
  )
}
