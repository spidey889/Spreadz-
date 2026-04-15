export const getRenderableMessages = ({ messages, visibleMessageIds, isMutedUser }) => {
  const unmutedMessages = messages.filter((message) => !isMutedUser(message.user_uuid))

  if (unmutedMessages.length === 0) {
    return []
  }

  if (!(visibleMessageIds instanceof Set) || visibleMessageIds.size === 0) {
    return unmutedMessages
  }

  const visibleMessages = unmutedMessages.filter((message) => visibleMessageIds.has(message.id))
  return visibleMessages.length > 0 ? visibleMessages : unmutedMessages
}
