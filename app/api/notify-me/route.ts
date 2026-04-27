import { NextResponse } from 'next/server'

export async function POST() {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL

  if (!webhookUrl) {
    return NextResponse.json({ ok: false })
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: "👀 Someone just opened Spreadz!",
      }),
    })
  } catch (error) {
    // Fail silently as requested
  }

  return NextResponse.json({ ok: true })
}
