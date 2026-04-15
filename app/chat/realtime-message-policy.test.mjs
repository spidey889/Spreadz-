import assert from 'node:assert/strict'

import { getRealtimeMessagePolicy } from './realtime-message-policy.js'

const sameAccountMessagePolicy = getRealtimeMessagePolicy({
  roomId: 'room-1',
  roomIsKnown: true,
  messageAuthorId: 'user-123',
  currentUserId: 'user-123',
  isMutedAuthor: false,
  optimisticTempId: '',
})

assert.equal(sameAccountMessagePolicy.shouldIgnore, false)
assert.equal(sameAccountMessagePolicy.shouldNotify, false)
assert.equal(sameAccountMessagePolicy.shouldFetchRooms, false)
assert.equal(sameAccountMessagePolicy.isCurrentUsersMessage, true)

const otherUserMessagePolicy = getRealtimeMessagePolicy({
  roomId: 'room-1',
  roomIsKnown: true,
  messageAuthorId: 'user-456',
  currentUserId: 'user-123',
  isMutedAuthor: false,
  optimisticTempId: '',
})

assert.equal(otherUserMessagePolicy.shouldIgnore, false)
assert.equal(otherUserMessagePolicy.shouldNotify, true)
assert.equal(otherUserMessagePolicy.isCurrentUsersMessage, false)

const optimisticEchoPolicy = getRealtimeMessagePolicy({
  roomId: 'room-1',
  roomIsKnown: true,
  messageAuthorId: 'user-123',
  currentUserId: 'user-123',
  isMutedAuthor: false,
  optimisticTempId: 'temp-1',
})

assert.equal(optimisticEchoPolicy.shouldIgnore, false)
assert.equal(optimisticEchoPolicy.shouldNotify, false)

const mutedAuthorPolicy = getRealtimeMessagePolicy({
  roomId: 'room-1',
  roomIsKnown: true,
  messageAuthorId: 'user-456',
  currentUserId: 'user-123',
  isMutedAuthor: true,
  optimisticTempId: '',
})

assert.equal(mutedAuthorPolicy.shouldIgnore, true)
assert.equal(mutedAuthorPolicy.shouldNotify, false)

console.log('Realtime message policy checks passed.')
