import { NextResponse } from 'next/server'

const DEFAULT_MODEL = 'gemini-1.5-flash'
const MAX_TOKENS = 140

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

  let payload: { message?: string; ghostName?: string; ghostCollege?: string }
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

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL
  const prompt = [
    `You are ${ghostName}, a real human chatting in a college discussion room.`,
    `You study at ${ghostCollege}.`,
    `Reply like a normal person. Be casual, short (1-2 sentences), and friendly.`,
    `Never mention being an AI, bot, assistant, model, or system.`,
    `If asked about being AI, deflect like a regular person would.`,
    `User message: ${message}`,
  ].join('\n')

  let response: Response
  try {
    console.log('[Ghost] Calling Gemini model', { model })
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: MAX_TOKENS,
            topP: 0.9,
          },
        }),
      }
    )
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

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

  if (!text) {
    console.warn('[Ghost] Empty Gemini response', { data })
    return NextResponse.json({ error: 'Empty response' }, { status: 502 })
  }

  console.log('[Ghost] Gemini response ok', { preview: text.slice(0, 120) })
  return NextResponse.json({ text })
}
