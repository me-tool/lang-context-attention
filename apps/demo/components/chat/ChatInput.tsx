'use client'

import { useState, useRef } from 'react'
import { Input, Button, Space } from 'antd'
import { SendOutlined } from '@ant-design/icons'
import { useSessionStore } from '@/stores/session'

const { TextArea } = Input

export function ChatInput() {
  const [value, setValue] = useState('')
  const { sendMessage, isStreaming, session } = useSessionStore()
  const textAreaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = async () => {
    const trimmed = value.trim()
    if (!trimmed || isStreaming || !session) return

    setValue('')
    try {
      await sendMessage(trimmed)
    } catch (error) {
      console.error('Failed to send message:', error)
    }
    textAreaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      style={{
        padding: '12px 24px 16px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        backgroundColor: '#1a1a1a',
      }}
    >
      <Space.Compact style={{ width: '100%' }}>
        <TextArea
          ref={textAreaRef as never}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={session ? 'Type a message... (Shift+Enter for new line)' : 'Creating session...'}
          autoSize={{ minRows: 1, maxRows: 6 }}
          disabled={!session || isStreaming}
          style={{ resize: 'none' }}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          loading={isStreaming}
          disabled={!value.trim() || !session}
          style={{ height: 'auto' }}
        />
      </Space.Compact>
    </div>
  )
}
