import { NextResponse } from 'next/server'

const DEFAULT_MODEL = 'llama-3.1-8b-instant'
const MAX_TOKENS = 140

export async function POST(request: Request) {
  if (process.env.AI_GHOST_ENABLED !== 'true') {
    console.log('[Ghost] Disabled via AI_GHOST_ENABLED')
    return NextResponse.json({ enabled: false }, { status: 200 })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    console.error('[Ghost] Missing GROQ_API_KEY')
    return NextResponse.json({ error: 'Missing GROQ_API_KEY' }, { status: 500 })
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

  const model = process.env.GROQ_MODEL || DEFAULT_MODEL
  const systemPrompt = [
    `You are ${ghostName}, a real human chatting in a college discussion room.`,
    `You study at ${ghostCollege}.`,
    `Reply like a normal person in Hinglish. Be casual, short (1-2 sentences), and friendly.`,
    `Never mention being an AI, bot, assistant, model, or system.`,
    `If asked about being AI, deflect like a regular person would.`,
  ].join('\n')

  let response: Response
  try {
    console.log('[Ghost] Calling Groq model', { model })
    response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
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
          top_p: 0.9,
          presence_penalty: 0.2,
          frequency_penalty: 0.2,
          stream: false,
        }),
      }
    )
  } catch (error) {
    console.error('[Ghost] Groq fetch failed', error)
    return NextResponse.json({ error: 'Groq request failed' }, { status: 502 })
  }

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[Ghost] Groq response error', {
      status: response.status,
      statusText: response.statusText,
      errorText,
    })
    return NextResponse.json({ error: errorText || 'Groq request failed' }, { status: 502 })
  }

  const data = await response.json()
  const text = data?.choices?.[0]?.message?.content?.trim()

  if (!text) {
    console.warn('[Ghost] Empty Groq response', { data })
    return NextResponse.json({ error: 'Empty response' }, { status: 502 })
  }

  console.log('[Ghost] Groq response ok', { preview: text.slice(0, 120) })
  return NextResponse.json({ text })
}
