import assert from 'node:assert/strict'

import { getRenderableMessages } from './message-visibility.js'

const messages = [
  { id: 'm1', user_uuid: 'user-1' },
  { id: 'm2', user_uuid: 'user-2' },
  { id: 'm3', user_uuid: 'user-3' },
]

const neverMuted = () => false

assert.deepEqual(
  getRenderableMessages({
    messages,
    visibleMessageIds: new Set(),
    isMutedUser: neverMuted,
  }).map((message) => message.id),
  ['m1', 'm2', 'm3'],
  'history should still render when reveal ids are temporarily empty'
)

assert.deepEqual(
  getRenderableMessages({
    messages,
    visibleMessageIds: new Set(['m2']),
    isMutedUser: neverMuted,
  }).map((message) => message.id),
  ['m2'],
  'explicit reveal ids should still drive incremental reveals when present'
)

assert.deepEqual(
  getRenderableMessages({
    messages,
    visibleMessageIds: new Set(['missing-id']),
    isMutedUser: neverMuted,
  }).map((message) => message.id),
  ['m1', 'm2', 'm3'],
  'stale reveal ids should not blank the whole room'
)

assert.deepEqual(
  getRenderableMessages({
    messages,
    visibleMessageIds: new Set(),
    isMutedUser: (userId) => userId === 'user-2',
  }).map((message) => message.id),
  ['m1', 'm3'],
  'muted authors should stay hidden even when reveal ids fall back'
)

console.log('Message visibility checks passed.')
