/**
 * FRIDAY — Non-blocking Personalization Algorithm for Spreadz
 *
 * All tracking happens in memory only. Zero Supabase calls during user interaction.
 * Data is flushed to Supabase only on beforeunload or every 60s in the background.
 * Room ranking happens ONLY on app open using data from previous sessions.
 */

import { supabase } from './supabase'

const USERNAME_STORAGE_KEY = 'spreadz_username'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Room {
    id: string
    headline: string
    created_at: string
}

// ── In-Memory Session Store — never touches Supabase during session ────────────

const sessionData: Record<string, {
    secondsSpent: number
    messagesSent: number
    entryTime: number | null
}> = {}
// ── Interest Keyword Map ───────────────────────────────────────────────────────

const INTEREST_KEYWORDS: Record<string, string[]> = {
    'Tech & AI': ['AI', 'tech', 'engineer', 'software', 'startup', 'coding'],
    'Sports': ['IPL', 'cricket', 'football', 'sport', 'tournament', 'match'],
    'Politics': ['election', 'government', 'policy', 'minister', 'vote', 'party'],
    'Entertainment': ['movie', 'film', 'music', 'celebrity', 'Netflix', 'show'],
    'Business': ['MBA', 'startup', 'market', 'economy', 'business', 'career'],
    'Science': ['science', 'research', 'space', 'climate', 'health'],
    'Gaming': ['game', 'gaming', 'esports', 'PlayStation', 'stream'],
    'Campus Life': ['college', 'university', 'campus', 'student', 'exam', 'degree'],
}

// ── User Identity ──────────────────────────────────────────────────────────────

function getUsername(): string {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem(USERNAME_STORAGE_KEY)?.trim() || ''
}

// ── Interest Management ────────────────────────────────────────────────────────

export function saveInterests(interests: string[]): void {
    if (typeof window === 'undefined') return
    localStorage.setItem('spreadz_interests', JSON.stringify(interests))
}

export function getInterests(): string[] {
    if (typeof window === 'undefined') return []
    try {
        const stored = localStorage.getItem('spreadz_interests')
        return stored ? JSON.parse(stored) : []
    } catch { return [] }
}



// ── Room Tracking (pure memory, zero Supabase) ────────────────────────────────

/** Called when user enters a room — pure memory, zero Supabase. */
export function trackRoomEnter(roomId: string): void {
    if (!sessionData[roomId]) {
        sessionData[roomId] = { secondsSpent: 0, messagesSent: 0, entryTime: null }
    }
    sessionData[roomId].entryTime = Date.now()
}

/** Called when user leaves a room — pure memory, zero Supabase. */
export function trackRoomLeave(roomId: string): void {
    const data = sessionData[roomId]
    if (!data || !data.entryTime) return
    const seconds = Math.round((Date.now() - data.entryTime) / 1000)
    data.secondsSpent += seconds
    data.entryTime = null
}

/** Pure memory. */
export function trackMessageSent(roomId: string): void {
    if (!sessionData[roomId]) {
        sessionData[roomId] = { secondsSpent: 0, messagesSent: 0, entryTime: null }
    }
    sessionData[roomId].messagesSent++
}



// ── Batch Flush — only called on beforeunload or every 60s ─────────────────────

/**
 * Batch write ALL session data to Supabase at once.
 * Called ONLY on window beforeunload or via 60-second interval.
 */
export async function flushToSupabase(): Promise<void> {
    const username = getUsername()
    if (!username) return
    const roomIds = Object.keys(sessionData)
    if (roomIds.length === 0) return

    try {
        for (const roomId of roomIds) {
            const d = sessionData[roomId]
            if (d.secondsSpent < 1 && d.messagesSent === 0) continue

            const today = new Date().toISOString().split('T')[0]
            const { data: existing } = await supabase
                .from('user_behaviour')
                .select('id, seconds_spent, messages_sent')
                .eq('username', username)
                .eq('room_id', roomId)
                .gte('visited_at', `${today}T00:00:00.000Z`)
                .limit(1)

            if (existing && existing.length > 0) {
                await supabase.from('user_behaviour').update({
                    seconds_spent: existing[0].seconds_spent + d.secondsSpent,
                    messages_sent: existing[0].messages_sent + d.messagesSent,
                }).eq('id', existing[0].id)
            } else {
                await supabase.from('user_behaviour').insert({
                    username,
                    room_id: roomId,
                    seconds_spent: d.secondsSpent,
                    messages_sent: d.messagesSent,
                })
            }
        }
    } catch (err) {
        console.error('[FRIDAY] flush error:', err)
    }
}

// ── Core Ranking — only called on app open, never during scrolling ──────────────

/**
 * THE CORE RANKING FUNCTION
 *
 * Fetches this user's behaviour data from Supabase (from previous sessions)
 * and returns rooms reordered using FRIDAY scoring:
 *
 * Score = (seconds_spent * 0.4) + (messages_sent * 0.3)
 *
 * Then applies:
 * - Interest keyword boost: +20% if room headline matches saved interests
 * - Recency boost: newer rooms get a small boost (max +3 points)
 * - 70/30 rule: 70% top-scoring rooms, 30% least-interacted rooms (variety)
 */
export async function rankRooms(rooms: Room[]): Promise<Room[]> {
    if (!rooms || rooms.length <= 1) return rooms

    try {
        const username = getUsername()
        if (!username) return rooms
        const { data: behaviourData } = await supabase
            .from('user_behaviour')
            .select('room_id, seconds_spent, messages_sent')
            .eq('username', username)

        // Aggregate behaviour by room
        const behaviourMap: Record<string, {
            seconds_spent: number
            messages_sent: number
        }> = {}

        if (behaviourData) {
            for (const record of behaviourData) {
                if (behaviourMap[record.room_id]) {
                    behaviourMap[record.room_id].seconds_spent += record.seconds_spent
                    behaviourMap[record.room_id].messages_sent += record.messages_sent
                } else {
                    behaviourMap[record.room_id] = {
                        seconds_spent: record.seconds_spent,
                        messages_sent: record.messages_sent,
                    }
                }
            }
        }

        // Build interest keywords for boost
        const interests = getInterests()
        const interestKeywords: string[] = []
        for (const interest of interests) {
            const kws = INTEREST_KEYWORDS[interest]
            if (kws) interestKeywords.push(...kws)
        }

        // Calculate recency normalization
        const roomTimes = rooms.map(r => new Date(r.created_at).getTime())
        const newestTime = Math.max(...roomTimes)
        const oldestTime = Math.min(...roomTimes)
        const timeRange = newestTime - oldestTime || 1

        // Score each room
        const scored = rooms.map(room => {
            const b = behaviourMap[room.id]
            let score = 0

            if (b) {
                score = (b.seconds_spent * 0.4) + (b.messages_sent * 0.3)
            }

            // Interest keyword boost
            if (interestKeywords.length > 0) {
                const hl = room.headline.toLowerCase()
                const match = interestKeywords.some(kw => hl.includes(kw.toLowerCase()))
                if (match) score = score > 0 ? score * 1.2 : score + 5
            }

            // Recency boost (max +3)
            const recency = (new Date(room.created_at).getTime() - oldestTime) / timeRange
            score += recency * 3

            return { room, score }
        })

        // Sort by score descending
        const sorted = [...scored].sort((a, b) => b.score - a.score)

        // 70/30 split
        const totalSlots = rooms.length
        const topSlots = Math.ceil(totalSlots * 0.7)
        const topRooms = sorted.slice(0, topSlots)
        const topIds = new Set(topRooms.map(r => r.room.id))
        const varietyRooms = sorted.filter(r => !topIds.has(r.room.id))

        // Interleave: top rooms with variety sprinkled every 3rd slot
        const result: Room[] = []
        let ti = 0, vi = 0
        for (let i = 0; i < totalSlots; i++) {
            if (vi < varietyRooms.length && i > 0 && i % 3 === 0) {
                result.push(varietyRooms[vi++].room)
            } else if (ti < topRooms.length) {
                result.push(topRooms[ti++].room)
            } else if (vi < varietyRooms.length) {
                result.push(varietyRooms[vi++].room)
            }
        }

        return result
    } catch (err) {
        console.error('[FRIDAY] rankRooms error:', err)
        return rooms
    }
}


