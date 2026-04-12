import { NextResponse } from 'next/server'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_OPENROUTER_MODEL = 'arcee-ai/trinity-large-preview:free'
const MAX_TOKENS = 256

type GhostRequestPayload = {
  message?: string
  ghostName?: string
  ghostCollege?: string
}

type OpenRouterChatResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
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
  const ghostName = payload.ghostName?.trim() || 'Rohit'
  const ghostCollege = payload.ghostCollege?.trim() || 'IIT Bombay'

  if (!message) {
    console.warn('[Ghost] Missing message in payload')
    return NextResponse.json({ error: 'Missing message' }, { status: 400 })
  }

  console.log('[Ghost] Request received', {
    messagePreview: message.slice(0, 120),
    ghostName,
    ghostCollege,
  })

  const model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL
  const systemPrompt = [
    `you are ${ghostName}, a student at ${ghostCollege} in a whatsapp group chat.`,
    `reply like a real indian college student texting in the group.`,
    `keep it short, casual, natural, and unbothered.`,
    `sound like a real person on their phone, not an assistant or a bot.`,
    `never mention being ai.`,
  ].join('\n')

  let response: Response
  try {
    console.log('[Ghost] Calling OpenRouter model', { model })
    response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        temperature: 0.9,
        max_tokens: MAX_TOKENS,
        reasoning: { exclude: true },
        stream: false,
      }),
    })
  } catch (error) {
    console.error('[Ghost] OpenRouter fetch failed', error)
    return NextResponse.json({ error: 'OpenRouter request failed' }, { status: 502 })
  }

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[Ghost] OpenRouter response error', {
      status: response.status,
      statusText: response.statusText,
      errorText,
    })
    return NextResponse.json({ error: errorText || 'OpenRouter request failed' }, { status: 502 })
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
