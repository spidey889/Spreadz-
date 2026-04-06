import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  AI_GHOST_DEFAULT_MODEL,
  AI_GHOST_DISPLAY_NAME,
  AI_GHOST_REPLY,
  isAiGhostGreetingPrompt,
  normalizeAiGhostReply,
} from '@/lib/ai-ghost'

export const runtime = 'nodejs'

type GhostReplyRequestBody = {
  room_id?: string
  message_id?: string
}

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
}

const getBearerToken = (request: Request) => {
  const authorizationHeader = request.headers.get('authorization') || request.headers.get('Authorization') || ''
  const [scheme, token] = authorizationHeader.split(' ')

  if (!/^Bearer$/i.test(scheme) || !token?.trim()) {
    return ''
  }

  return token.trim()
}

const createSupabaseClient = (supabaseUrl: string, supabaseKey: string, accessToken?: string) =>
  createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  })

const getReplyTextFromPayload = (payload: OpenRouterResponse) => {
  const content = payload.choices?.[0]?.message?.content

  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (part?.type === 'text' && typeof part.text === 'string' ? part.text : ''))
      .join('')
  }

  return ''
}

const generateGhostReply = async (apiKey: string, model: string, prompt: string) => {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 4,
        messages: [
          {
            role: 'system',
            content: 'Reply with exactly the single word hello in lowercase. Do not add punctuation or any other text.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      throw new Error(`OpenRouter request failed with ${response.status}: ${errorBody}`)
    }

    const payload = (await response.json()) as OpenRouterResponse
    return normalizeAiGhostReply(getReplyTextFromPayload(payload))
  } catch (error) {
    console.error('[AI Ghost] Reply generation failed, using fallback.', error)
    return AI_GHOST_REPLY
  }
}

export async function POST(request: Request) {
  let body: GhostReplyRequestBody | null = null

  try {
    body = (await request.json()) as GhostReplyRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const roomId = typeof body?.room_id === 'string' ? body.room_id.trim() : ''
  const messageId = typeof body?.message_id === 'string' ? body.message_id.trim() : ''
  const accessToken = getBearerToken(request)

  if (!roomId) {
    return NextResponse.json({ error: 'room_id is required' }, { status: 400 })
  }

  if (!messageId) {
    return NextResponse.json({ error: 'message_id is required' }, { status: 400 })
  }

  if (!accessToken) {
    return NextResponse.json({ error: 'Authorization is required' }, { status: 401 })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
  const openRouterApiKey = process.env.OPENROUTER_API_KEY?.trim() || ''
  const aiGhostEnabled = (process.env.AI_GHOST_ENABLED || '').trim().toLowerCase() === 'true'
  const aiGhostModel = process.env.AI_GHOST_MODEL?.trim() || AI_GHOST_DEFAULT_MODEL

  if (!aiGhostEnabled) {
    return NextResponse.json({ triggered: false, reason: 'disabled' })
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  const authSupabase = createSupabaseClient(supabaseUrl, supabaseAnonKey)
  const userSupabase = createSupabaseClient(supabaseUrl, supabaseAnonKey, accessToken)
  const adminSupabase = supabaseServiceRoleKey
    ? createSupabaseClient(supabaseUrl, supabaseServiceRoleKey)
    : null

  const {
    data: { user },
    error: authError,
  } = await authSupabase.auth.getUser(accessToken)

  if (authError || !user) {
    console.error('[AI Ghost] Authorization failed', authError)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: message, error: messageError } = await userSupabase
    .from('messages')
    .select('id, room_id, room_name, user_uuid, content')
    .eq('id', messageId)
    .eq('room_id', roomId)
    .eq('user_uuid', user.id)
    .maybeSingle()

  if (messageError) {
    console.error('[AI Ghost] Failed to verify message ownership', messageError)
    return NextResponse.json({ error: 'Failed to verify message' }, { status: 500 })
  }

  if (!message) {
    return NextResponse.json({ error: 'Message not found for current user' }, { status: 403 })
  }

  if (!isAiGhostGreetingPrompt(message.content || '')) {
    return NextResponse.json({ triggered: false, reason: 'not-hi' })
  }

  const reply = openRouterApiKey
    ? await generateGhostReply(openRouterApiKey, aiGhostModel, message.content || '')
    : AI_GHOST_REPLY

  if (!adminSupabase) {
    return NextResponse.json({
      triggered: true,
      persisted: false,
      reply,
      display_name: AI_GHOST_DISPLAY_NAME,
    })
  }

  const { data: insertedMessages, error: insertError } = await adminSupabase
    .from('messages')
    .insert({
      content: reply,
      display_name: AI_GHOST_DISPLAY_NAME,
      college: '',
      room_name: message.room_name ?? null,
      room_id: roomId,
      user_uuid: null,
    })
    .select('id, content, created_at, display_name, college, room_name, room_id, user_uuid')

  if (insertError) {
    console.error('[AI Ghost] Failed to insert reply, returning fallback payload', insertError)
    return NextResponse.json({
      triggered: true,
      persisted: false,
      reply,
      display_name: AI_GHOST_DISPLAY_NAME,
    })
  }

  return NextResponse.json({
    triggered: true,
    persisted: true,
    reply,
    message: insertedMessages?.[0] ?? null,
  })
}
