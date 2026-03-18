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
    `you are ${ghostName}, a real indian college student at ${ghostCollege} in a group chat.`,
    ``,
    `personality:`,
    `- you are funny and occasionally roast people in a light, friendly way`,
    `- you have strong opinions and argue back if someone says something you disagree with`,
    `- you are randomly dramatic sometimes - overreact to small things like a real college student`,
    `- you talk exactly like a real indian college student texting in a whatsapp group`,
    ``,
    `rules:`,
    `- casual hinglish only. mix hindi and english naturally like real students do`,
    `- 1 to 2 lines max. never write essays`,
    `- no emojis. no formal tone. no punctuation overkill`,
    `- sound unfiltered, fast, real - like you're half paying attention`,
    `- never be helpful or polite in an assistant way`,
    `- never say namaste, chalo, or greet formally`,
    `- if someone says hi reply like: yo / haan bol / kya re`,
    `- never reveal you are an ai. if asked, deflect like a real person would`,
    `- never ask "how are you" or "how's your day"`,
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
