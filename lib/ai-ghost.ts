export const AI_GHOST_DEFAULT_MODEL = 'stepfun/step-3.5-flash:free'
export const AI_GHOST_DISPLAY_NAME = 'Stepfun'
export const AI_GHOST_REPLY = 'hello'

export const isAiGhostGreetingPrompt = (value: string) => /^hi[.!?]*$/i.test(value.trim())

export const normalizeAiGhostReply = (value?: string | null) => {
  const trimmedValue = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return trimmedValue === AI_GHOST_REPLY ? AI_GHOST_REPLY : AI_GHOST_REPLY
}
