/**
 * FRIDAY — Non-blocking Personalization Algorithm for Spreadz
 *
 * All tracking happens in memory only. Zero Supabase calls during user interaction.
 * Data is flushed to Supabase only on beforeunload or every 60s in the background.
 * Room ranking happens ONLY on app open using data from previous sessions.
 */

import { supabase } from './supabase'

const USERNAME_STORAGE_KEY = 'spreadz_username'

interface Room {
    id: string
    headline: string
    created_at: string
}

type SessionRoomData = {
    roomName: string
    timeSpentSeconds: number
    messagesSent: number
    visitCount: number
    entryTime: number | null
}

const sessionData: Record<string, SessionRoomData> = {}

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

function getUsername(): string {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem(USERNAME_STORAGE_KEY)?.trim() || ''
}

function getOrCreateRoomSession(roomId: string, roomName = ''): SessionRoomData {
    if (!sessionData[roomId]) {
        sessionData[roomId] = {
            roomName,
            timeSpentSeconds: 0,
            messagesSent: 0,
            visitCount: 0,
            entryTime: null,
        }
    } else if (roomName) {
        sessionData[roomId].roomName = roomName
    }

    return sessionData[roomId]
}

function syncActiveRoomTime(roomId: string): void {
    const data = sessionData[roomId]
    if (!data || !data.entryTime) return

    const elapsedSeconds = Math.max(0, Math.round((Date.now() - data.entryTime) / 1000))
    data.timeSpentSeconds += elapsedSeconds
    data.entryTime = Date.now()
}

export function saveInterests(interests: string[]): void {
    if (typeof window === 'undefined') return
    localStorage.setItem('spreadz_interests', JSON.stringify(interests))
}

export function getInterests(): string[] {
    if (typeof window === 'undefined') return []
    try {
        const stored = localStorage.getItem('spreadz_interests')
        return stored ? JSON.parse(stored) : []
    } catch {
        return []
    }
}

/** Called when user enters a room — pure memory, zero Supabase. */
export function trackRoomEnter(roomId: string, roomName: string): void {
    if (!roomId) return

    const data = getOrCreateRoomSession(roomId, roomName)
    data.roomName = roomName
    data.visitCount += 1
    data.entryTime = Date.now()
}

/** Called when user leaves a room — pure memory, zero Supabase. */
export function trackRoomLeave(roomId: string): void {
    const data = sessionData[roomId]
    if (!data || !data.entryTime) return

    const elapsedSeconds = Math.max(0, Math.round((Date.now() - data.entryTime) / 1000))
    data.timeSpentSeconds += elapsedSeconds
    data.entryTime = null
}

/** Called only after a confirmed message insert. */
export function trackMessageSent(roomId: string, roomName: string): void {
    if (!roomId) return

    const data = getOrCreateRoomSession(roomId, roomName)
    if (roomName) data.roomName = roomName
    data.messagesSent += 1
}

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
            syncActiveRoomTime(roomId)

            const data = sessionData[roomId]
            if (!data) continue
            if (data.timeSpentSeconds < 1 && data.messagesSent === 0 && data.visitCount === 0) continue

            const { data: existing } = await supabase
                .from('user_behaviour')
                .select('id, messages_sent, time_spent_seconds, came_back')
                .eq('username', username)
                .eq('room_id', roomId)
                .limit(1)

            if (existing && existing.length > 0) {
                const nextTimeSpentSeconds = existing[0].time_spent_seconds + data.timeSpentSeconds
                await supabase.from('user_behaviour').update({
                    room_name: data.roomName,
                    messages_sent: existing[0].messages_sent + data.messagesSent,
                    time_spent_seconds: nextTimeSpentSeconds,
                    time_spent_minutes: Math.floor(nextTimeSpentSeconds / 60),
                    came_back: existing[0].came_back + data.visitCount,
                }).eq('id', existing[0].id)
            } else {
                await supabase.from('user_behaviour').insert({
                    username,
                    room_name: data.roomName,
                    room_id: roomId,
                    messages_sent: data.messagesSent,
                    time_spent_seconds: data.timeSpentSeconds,
                    time_spent_minutes: Math.floor(data.timeSpentSeconds / 60),
                    came_back: Math.max(0, data.visitCount - 1),
                })
            }

            data.timeSpentSeconds = 0
            data.messagesSent = 0
            data.visitCount = 0
        }
    } catch (err) {
        console.error('[FRIDAY] flush error:', err)
    }
}

/**
 * THE CORE RANKING FUNCTION
 *
 * Fetches this user's behaviour data from Supabase (from previous sessions)
 * and returns rooms reordered using FRIDAY scoring:
 *
 * Score = (time_spent_seconds * 0.4) + (messages_sent * 0.3) + (came_back * 0.2)
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
            .select('room_id, time_spent_seconds, messages_sent, came_back')
            .eq('username', username)

        const behaviourMap: Record<string, {
            time_spent_seconds: number
            messages_sent: number
            came_back: number
        }> = {}

        if (behaviourData) {
            for (const record of behaviourData) {
                if (behaviourMap[record.room_id]) {
                    behaviourMap[record.room_id].time_spent_seconds += record.time_spent_seconds
                    behaviourMap[record.room_id].messages_sent += record.messages_sent
                    behaviourMap[record.room_id].came_back += record.came_back
                } else {
                    behaviourMap[record.room_id] = {
                        time_spent_seconds: record.time_spent_seconds,
                        messages_sent: record.messages_sent,
                        came_back: record.came_back,
                    }
                }
            }
        }

        const interests = getInterests()
        const interestKeywords: string[] = []
        for (const interest of interests) {
            const keywords = INTEREST_KEYWORDS[interest]
            if (keywords) interestKeywords.push(...keywords)
        }

        const roomTimes = rooms.map(room => new Date(room.created_at).getTime())
        const newestTime = Math.max(...roomTimes)
        const oldestTime = Math.min(...roomTimes)
        const timeRange = newestTime - oldestTime || 1

        const scored = rooms.map(room => {
            const behaviour = behaviourMap[room.id]
            let score = 0

            if (behaviour) {
                score = (behaviour.time_spent_seconds * 0.4) +
                    (behaviour.messages_sent * 0.3) +
                    (behaviour.came_back * 0.2)
            }

            if (interestKeywords.length > 0) {
                const headline = room.headline.toLowerCase()
                const match = interestKeywords.some(keyword => headline.includes(keyword.toLowerCase()))
                if (match) score = score > 0 ? score * 1.2 : score + 5
            }

            const recency = (new Date(room.created_at).getTime() - oldestTime) / timeRange
            score += recency * 3

            return { room, score }
        })

        const sorted = [...scored].sort((a, b) => b.score - a.score)

        const totalSlots = rooms.length
        const topSlots = Math.ceil(totalSlots * 0.7)
        const topRooms = sorted.slice(0, topSlots)
        const topIds = new Set(topRooms.map(room => room.room.id))
        const varietyRooms = sorted.filter(room => !topIds.has(room.room.id))

        const result: Room[] = []
        let topIndex = 0
        let varietyIndex = 0

        for (let i = 0; i < totalSlots; i++) {
            if (varietyIndex < varietyRooms.length && i > 0 && i % 3 === 0) {
                result.push(varietyRooms[varietyIndex++].room)
            } else if (topIndex < topRooms.length) {
                result.push(topRooms[topIndex++].room)
            } else if (varietyIndex < varietyRooms.length) {
                result.push(varietyRooms[varietyIndex++].room)
            }
        }

        return result
    } catch (err) {
        console.error('[FRIDAY] rankRooms error:', err)
        return rooms
    }
}
