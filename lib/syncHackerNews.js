import 'server-only'

import { createClient } from '@supabase/supabase-js'

const TOP_STORIES_URL = 'https://hacker-news.firebaseio.com/v0/topstories.json'
const ITEM_URL = (id) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`
const COMMENT_LIMIT = 10
const HN_ROOM_ID = process.env.HN_ROOM_ID
const HN_ROOM_NAME = 'Hacker News'
const HN_COLLEGE = 'Hacker News'

const HTML_ENTITY_MAP = {
  '&amp;': '&',
  '&apos;': "'",
  '&gt;': '>',
  '&lt;': '<',
  '&nbsp;': ' ',
  '&quot;': '"',
}

function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are missing.')
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Request failed for ${url} with status ${response.status}.`)
  }

  return response.json()
}

function decodeHtmlEntities(value = '') {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(
      /&(amp|apos|gt|lt|nbsp|quot);/g,
      (match) => HTML_ENTITY_MAP[match] ?? match
    )
}

function normalizeCommentText(value = '') {
  return decodeHtmlEntities(
    value
      .replace(/<p>/gi, '\n\n')
      .replace(/<\/p>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function fetchTopStoryWithComments() {
  const topStoryIds = await fetchJson(TOP_STORIES_URL)

  if (!Array.isArray(topStoryIds) || topStoryIds.length === 0) {
    throw new Error('Hacker News did not return any top stories.')
  }

  const story = await fetchJson(ITEM_URL(topStoryIds[0]))

  if (!story?.id || !story?.title) {
    throw new Error('Top Hacker News story is missing required fields.')
  }

  const commentIds = Array.isArray(story.kids) ? story.kids.slice(0, COMMENT_LIMIT) : []
  const comments = await Promise.all(
    commentIds.map(async (commentId) => {
      try {
        const comment = await fetchJson(ITEM_URL(commentId))

        if (!comment || comment.deleted || comment.dead || !comment.text) {
          return null
        }

        const content = normalizeCommentText(comment.text)
        if (!content) {
          return null
        }

        return {
          content,
          display_name: comment.by || 'Hacker News User',
        }
      } catch (error) {
        console.error('[HackerNewsSync] Failed to fetch comment:', error)
        return null
      }
    })
  )

  return {
    title: story.title,
    comments: comments.filter(Boolean),
  }
}

export async function syncHackerNews() {
  if (!HN_ROOM_ID) {
    console.warn('[HackerNewsSync] Skipping sync because HN_ROOM_ID is not set.')
    return
  }

  const supabase = getSupabaseServerClient()
  const { error: authError } = await supabase.auth.signInAnonymously()

  if (authError) {
    throw authError
  }

  const { title, comments } = await fetchTopStoryWithComments()

  const { error: roomError } = await supabase
    .from('rooms')
    .update({ headline: title })
    .eq('id', HN_ROOM_ID)

  if (roomError) {
    throw roomError
  }

  const { error: deleteError } = await supabase
    .from('messages')
    .delete()
    .eq('college', HN_COLLEGE)

  if (deleteError) {
    throw deleteError
  }

  if (comments.length === 0) {
    return
  }

  const messageRows = comments.map((comment) => ({
    content: comment.content,
    display_name: comment.display_name,
    college: HN_COLLEGE,
    room_name: HN_ROOM_NAME,
    room_id: HN_ROOM_ID,
  }))

  const { error: insertError } = await supabase.from('messages').insert(messageRows)

  if (insertError) {
    throw insertError
  }
}

const globalSyncState = globalThis

export function syncHackerNewsOnce() {
  if (!globalSyncState.__spreadzHackerNewsSyncPromise) {
    globalSyncState.__spreadzHackerNewsSyncPromise = syncHackerNews().catch((error) => {
      console.error('[HackerNewsSync] Sync failed:', error)
    })
  }

  return globalSyncState.__spreadzHackerNewsSyncPromise
}
