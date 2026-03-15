'use client'

import { useRef, useEffect } from 'react'
import { Empty } from 'antd'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'

export function ChatArea() {
  const { messages, rootQuestions } = useSessionStore()
  const { selectedRootQuestionId } = useUiStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  const filteredMessages = selectedRootQuestionId
    ? messages.filter((m) => m.rootQuestionId === selectedRootQuestionId)
    : messages

  const rootQuestionIds = rootQuestions.map((rq) => rq.id)

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [filteredMessages.length, filteredMessages[filteredMessages.length - 1]?.content])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#141414',
      }}
    >
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px 24px',
        }}
      >
        {filteredMessages.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <Empty
              description="No messages yet. Start a conversation!"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          </div>
        ) : (
          filteredMessages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              rootQuestionIds={rootQuestionIds}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <ChatInput />
    </div>
  )
}
