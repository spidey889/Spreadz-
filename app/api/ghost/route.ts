import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_APP_URL = 'https://spreadz.in'
const OPENROUTER_APP_TITLE = 'Spreadz'
const DEFAULT_OPENROUTER_MODEL = 'arcee-ai/trinity-large-preview:free'
const HISTORY_FETCH_LIMIT = 30
const CONTEXT_FALLBACK_WINDOWS = [30, 20, 10, 5] as const
const MAX_CONTEXT_TOKENS = 80_000
const ESTIMATED_CHARS_PER_TOKEN = 4
const MAX_TOKENS = 256

type GhostRequestPayload = {
  message?: string
  roomId?: string
  ghostUuid?: string
  ghostName?: string
  ghostCollege?: string
}

type RoomMessageRow = Database['public']['Tables']['messages']['Row']

type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type HistoryMessage = {
  role: 'user' | 'assistant'
  content: string
}

type OpenRouterChatResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

function createServerSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[Ghost] Missing Supabase env for history context', {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasSupabaseAnonKey: Boolean(supabaseAnonKey),
    })
    return null
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

async function fetchRecentRoomMessages(roomId: string) {
  const supabase = createServerSupabaseClient()
  if (!supabase) return [] as RoomMessageRow[]

  const { data, error } = await supabase
    .from('messages')
    .select('id, content, display_name, college, room_id, created_at, user_uuid')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_FETCH_LIMIT)

  if (error) {
    console.error('[Ghost] Failed to fetch room history', {
      roomId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    })
    return [] as RoomMessageRow[]
  }

  return (data || []).reverse()
}

function isGhostMessage(row: RoomMessageRow, ghostUuid: string | undefined, ghostName: string, ghostCollege: string) {
  if (ghostUuid && row.user_uuid === ghostUuid) return true

  const displayName = row.display_name?.trim() || ''
  const college = row.college?.trim() || ''
  return displayName === ghostName && college === ghostCollege
}

function formatHistoryMessage(row: RoomMessageRow, ghostUuid: string | undefined, ghostName: string, ghostCollege: string) {
  const content = row.content?.trim()
  if (!content) return null

  if (isGhostMessage(row, ghostUuid, ghostName, ghostCollege)) {
    return {
      role: 'assistant',
      content,
    } satisfies HistoryMessage
  }

  const displayName = row.display_name?.trim() || 'Student'
  const college = row.college?.trim()
  const speakerLabel = college ? `${displayName} (${college})` : displayName

  return {
    role: 'user',
    content: `${speakerLabel}: ${content}`,
  } satisfies HistoryMessage
}

function estimateTokenCount(messages: OpenRouterMessage[]) {
  return messages.reduce((total, message) => {
    const contentTokens = Math.ceil(message.content.length / ESTIMATED_CHARS_PER_TOKEN)
    return total + contentTokens + 8
  }, 0)
}

function fitConversationWindow(systemPrompt: string, historyMessages: HistoryMessage[]) {
  const uniqueWindows = Array.from(new Set([historyMessages.length, ...CONTEXT_FALLBACK_WINDOWS]))
    .filter(limit => limit > 0)
    .map(limit => Math.min(limit, historyMessages.length))
    .filter((limit, index, limits) => limits.indexOf(limit) === index)

  for (const limit of uniqueWindows) {
    const trimmedHistory = historyMessages.slice(-limit)
    const conversationMessages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      ...trimmedHistory,
    ]
    const estimatedTokens = estimateTokenCount(conversationMessages) + MAX_TOKENS

    if (estimatedTokens <= MAX_CONTEXT_TOKENS) {
      return {
        conversationMessages,
        estimatedTokens,
        trimmedMessageCount: historyMessages.length - trimmedHistory.length,
      }
    }
  }

  return null
}

export async function POST(request: Request) {
  if (process.env.AI_GHOST_ENABLED?.trim() !== 'true') {
    console.log('[Ghost] Disabled via AI_GHOST_ENABLED')
    return NextResponse.json({ enabled: false }, { status: 200 })
  }

  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    console.error('[Ghost] Missing OPENROUTER_API_KEY')
    return NextResponse.json({ error: 'Missing OPENROUTER_API_KEY' }, { status: 500 })
  }

  let payload: GhostRequestPayload
  try {
    payload = await request.json()
  } catch {
    console.error('[Ghost] Invalid JSON payload')
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const message = payload.message?.trim()
  const roomId = payload.roomId?.trim()
  const ghostUuid = payload.ghostUuid?.trim()
  const ghostName = payload.ghostName?.trim() || 'Rohit'
  const ghostCollege = payload.ghostCollege?.trim() || 'IIT Bombay'

  if (!message) {
    console.warn('[Ghost] Missing message in payload')
    return NextResponse.json({ error: 'Missing message' }, { status: 400 })
  }

  console.log('[Ghost] Request received', {
    roomId,
    messagePreview: message.slice(0, 120),
    ghostUuid: ghostUuid || null,
    ghostName,
    ghostCollege,
  })

  const model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL
  const apiKeySuffix = apiKey.slice(-6)
  console.log('[Ghost] OpenRouter auth config', {
    hasApiKey: true,
    apiKeyLength: apiKey.length,
    apiKeySuffix,
    model,
    appUrl: OPENROUTER_APP_URL,
    appTitle: OPENROUTER_APP_TITLE,
  })

  const systemPrompt = [
    `you are ${ghostName}, a student at ${ghostCollege} in a whatsapp group chat.`,
    `reply like a real indian college student texting in the group.`,
    `keep it short, casual, natural, and unbothered.`,
    `sound like a real person on their phone, not an assistant or a bot.`,
    `never mention being ai.`,
  ].join('\n')

  const historyRows = roomId ? await fetchRecentRoomMessages(roomId) : []
  const historyMessages = historyRows
    .map(row => formatHistoryMessage(row, ghostUuid, ghostName, ghostCollege))
    .filter((entry): entry is HistoryMessage => Boolean(entry))

  const latestHistoryContent = historyRows[historyRows.length - 1]?.content?.trim()
  if (!historyMessages.length || latestHistoryContent !== message) {
    historyMessages.push({
      role: 'user',
      content: `Student: ${message}`,
    })
  }

  const fittedConversation = fitConversationWindow(systemPrompt, historyMessages)
  if (!fittedConversation) {
    const estimatedTokens = estimateTokenCount([
      { role: 'system', content: systemPrompt },
      ...historyMessages,
    ]) + MAX_TOKENS

    console.warn('[Ghost] Skipping reply because room context is too large', {
      roomId,
      historyMessageCount: historyMessages.length,
      estimatedTokens,
      maxContextTokens: MAX_CONTEXT_TOKENS,
    })
    return NextResponse.json(
      {
        skipped: true,
        reason: 'context_limit',
      },
      { status: 200 }
    )
  }

  console.log('[Ghost] Using room history context', {
    roomId,
    fetchedMessages: historyRows.length,
    contextMessages: fittedConversation.conversationMessages.length - 1,
    trimmedMessages: fittedConversation.trimmedMessageCount,
    estimatedTokens: fittedConversation.estimatedTokens,
  })

  let response: Response
  try {
    console.log('[Ghost] Calling OpenRouter model', { model })
    response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': OPENROUTER_APP_URL,
        'X-Title': OPENROUTER_APP_TITLE,
      },
      body: JSON.stringify({
        model,
        messages: fittedConversation.conversationMessages,
        temperature: 0.9,
        max_tokens: MAX_TOKENS,
        stream: false,
      }),
    })
  } catch (error) {
    console.error('[Ghost] OpenRouter fetch failed', error)
    return NextResponse.json({ error: 'OpenRouter request failed' }, { status: 502 })
  }

  if (response.status !== 200) {
    const errorBody = await response.text()
    if (response.status === 401) {
      console.error('[Ghost] OpenRouter 401 Unauthorized', {
        apiKeySuffix,
        model,
        statusText: response.statusText,
        errorBody,
      })
    }
    console.error('[Ghost] OpenRouter response error', {
      url: OPENROUTER_API_URL,
      model,
      status: response.status,
      statusText: response.statusText,
      errorBody,
    })
    const safeError =
      response.status === 401 || response.status === 403
        ? 'OpenRouter authentication failed'
        : 'OpenRouter request failed'

    return NextResponse.json(
      {
        error: safeError,
        providerStatus: response.status,
      },
      { status: 500 }
    )
  }

  const data = (await response.json()) as OpenRouterChatResponse
  const content = data?.choices?.[0]?.message?.content
  const text = typeof content === 'string' ? content.trim() : ''

  if (!text) {
    console.warn('[Ghost] Empty OpenRouter response', { data })
    return NextResponse.json({ error: 'Empty response' }, { status: 502 })
  }

  console.log('[Ghost] OpenRouter response ok', { preview: text.slice(0, 120) })
  return NextResponse.json({ text })
}
