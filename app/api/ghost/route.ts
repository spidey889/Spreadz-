import { NextResponse } from 'next/server'

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent'
const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview'
const MAX_TOKENS = 256

type GhostRequestPayload = {
  message?: string
  ghostName?: string
  ghostCollege?: string
}

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
}

export async function POST(request: Request) {
  if (process.env.AI_GHOST_ENABLED !== 'true') {
    console.log('[Ghost] Disabled via AI_GHOST_ENABLED')
    return NextResponse.json({ enabled: false }, { status: 200 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[Ghost] Missing GEMINI_API_KEY')
    return NextResponse.json({ error: 'Missing GEMINI_API_KEY' }, { status: 500 })
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

  const model = GEMINI_MODEL
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
    console.log('[Ghost] Calling Gemini model', { model })
    response = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: message }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: MAX_TOKENS,
        },
      }),
    })
  } catch (error) {
    console.error('[Ghost] Gemini fetch failed', error)
    return NextResponse.json({ error: 'Gemini request failed' }, { status: 502 })
  }

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[Ghost] Gemini response error', {
      status: response.status,
      statusText: response.statusText,
      errorText,
    })
    return NextResponse.json({ error: errorText || 'Gemini request failed' }, { status: 502 })
  }

  const data = (await response.json()) as GeminiGenerateContentResponse
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text
  const text = typeof content === 'string' ? content.trim() : ''

  if (!text) {
    console.warn('[Ghost] Empty Gemini response', { data })
    return NextResponse.json({ error: 'Empty response' }, { status: 502 })
  }

  console.log('[Ghost] Gemini response ok', { preview: text.slice(0, 120) })
  return NextResponse.json({ text })
}
