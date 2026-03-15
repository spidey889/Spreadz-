import { NextResponse } from 'next/server'

const DEFAULT_MODEL = 'gemini-1.5-flash'
const MAX_TOKENS = 140

export async function POST(request: Request) {
  if (process.env.AI_GHOST_ENABLED !== 'true') {
    return NextResponse.json({ enabled: false }, { status: 200 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing GEMINI_API_KEY' }, { status: 500 })
  }

  let payload: { message?: string; ghostName?: string; ghostCollege?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const message = payload.message?.trim()
  const ghostName = payload.ghostName?.trim() || 'Rohit'
  const ghostCollege = payload.ghostCollege?.trim() || 'IIT Bombay'

  if (!message) {
    return NextResponse.json({ error: 'Missing message' }, { status: 400 })
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL
  const prompt = [
    `You are ${ghostName}, a real human chatting in a college discussion room.`,
    `You study at ${ghostCollege}.`,
    `Reply like a normal person. Be casual, short (1-2 sentences), and friendly.`,
    `Never mention being an AI, bot, assistant, model, or system.`,
    `If asked about being AI, deflect like a regular person would.`,
    `User message: ${message}`,
  ].join('\n')

  const response = await fetch(
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

  if (!response.ok) {
    const errorText = await response.text()
    return NextResponse.json({ error: errorText || 'Gemini request failed' }, { status: 502 })
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

  if (!text) {
    return NextResponse.json({ error: 'Empty response' }, { status: 502 })
  }

  return NextResponse.json({ text })
}
