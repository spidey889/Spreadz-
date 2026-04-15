/**
 * Decide how a realtime message insert should be handled on this client.
 * Same-account messages must still merge into chat state so another device
 * logged into the same account receives the live update.
 *
 * @param {{
 *   roomId?: string | null
 *   roomIsKnown?: boolean
 *   messageAuthorId?: string | null
 *   currentUserId?: string | null
 *   isMutedAuthor?: boolean
 *   optimisticTempId?: string | null
 * }} input
 */
export function getRealtimeMessagePolicy(input) {
  const roomId = typeof input?.roomId === 'string' ? input.roomId.trim() : ''
  const roomIsKnown = Boolean(input?.roomIsKnown)
  const messageAuthorId = typeof input?.messageAuthorId === 'string' ? input.messageAuthorId.trim() : ''
  const currentUserId = typeof input?.currentUserId === 'string' ? input.currentUserId.trim() : ''
  const optimisticTempId = typeof input?.optimisticTempId === 'string' ? input.optimisticTempId.trim() : ''
  const isMutedAuthor = Boolean(input?.isMutedAuthor)
  const isCurrentUsersMessage = Boolean(messageAuthorId && currentUserId && messageAuthorId === currentUserId)

  return {
    isCurrentUsersMessage,
    shouldFetchRooms: Boolean(roomId && !roomIsKnown),
    shouldIgnore: !roomId || isMutedAuthor,
    shouldNotify: Boolean(roomId && !isMutedAuthor && !optimisticTempId && !isCurrentUsersMessage),
  }
}
