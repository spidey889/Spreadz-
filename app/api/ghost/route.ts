import { NextResponse } from 'next/server'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_MODEL = 'arcee-ai/trinity-mini:free'
const MAX_TOKENS = 140

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
  if (process.env.AI_GHOST_ENABLED !== 'true') {
    console.log('[Ghost] Disabled via AI_GHOST_ENABLED')
    return NextResponse.json({ enabled: false }, { status: 200 })
  }

  const apiKey = process.env.OPENROUTER_API_KEY
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

  const model = OPENROUTER_MODEL
  const systemPrompt = [
    `you are ${ghostName}, a real indian college student in a group chat.`,
    `you study at ${ghostCollege}.`,
    `reply like a real indian college student texting casually in a whatsapp group chat.`,
    `use casual hinglish only. never formal hindi or formal english.`,
    `keep replies short and natural, usually 1 to 2 lines max.`,
    `no emojis. no long paragraphs. no essay style replies.`,
    `sound unfiltered, casual, and like a real person typing fast.`,
    `prefer short group-chat style replies over detailed explanations.`,
    `never be overly helpful or overly polite.`,
    `never ask "how are you" or "how's your day".`,
    `never say namaste or chalo.`,
    `if user says hi, reply like: yo / haan bol / kya re / sup.`,
    `if user says hello, reply like: haan / bol na / kya hua.`,
    `never mention being ai, bot, assistant, model, or system.`,
    `if asked about being ai, deflect like a normal person would.`,
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
