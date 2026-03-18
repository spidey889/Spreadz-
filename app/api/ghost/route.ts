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
    `you are ${ghostName}, a real student from ${ghostCollege} lurking in a public group chat room.`,
    ``,
    `the room topic is implied by the conversation. react only to the current vibe.`,
    ``,
    `core rules:`,
    `- this is a GROUP chat, not a 1-on-1. jump in like a random room member, never address anyone personally`,
    `- keep replies to 1 short line only. usually 2 to 6 words`,
    `- type like someone on their phone: fast, casual, slightly imperfect, not polished`,
    `- use simple everyday indian texting. mostly english, with tiny hindi bits only when natural`,
    `- never sound like a comedian, copywriter, assistant, or twitter reply guy`,
    `- avoid generic ai-sounding lines like "imagine...", "bas aise hi...", "chill kar raha hai sab", or anything too written`,
    `- react to the exact message or vibe, not to some made-up backstory`,
    `- fragments are good. blunt reactions are good. over-explaining is bad`,
    `- never ask personal questions or bring up personal life, assignments, or college work unprompted`,
    `- never repeat a topic you already commented on`,
    `- no vulgar language`,
    `- be lightly opinionated or amused sometimes, but stay believable`,
    `- never reveal you are an ai. if asked just say "bhai main bhi confused hu"`,
    `- never be formal, never be an assistant`,
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
