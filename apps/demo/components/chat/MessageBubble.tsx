'use client'

import { useState } from 'react'
import { Dropdown, type MenuProps } from 'antd'
import { UserOutlined, RobotOutlined } from '@ant-design/icons'
import type { Message } from '@lang-context/core'
import { useUiStore } from '@/stores/ui'
import { useSessionStore } from '@/stores/session'
import { useDebugStore } from '@/stores/debug'
import { getTopicColorByMap } from '@/lib/colors'

interface Props {
  message: Message
  rootQuestionIds: string[]
}

export function MessageBubble({ message, rootQuestionIds }: Props) {
  const { selectMessage, selectedMessageId } = useUiStore()
  const { rootQuestions, reassignMessage } = useSessionStore()
  const { loadRoutingDecision } = useDebugStore()
  const [contextMenuOpen, setContextMenuOpen] = useState(false)

  const isUser = message.role === 'user'
  const color = getTopicColorByMap(message.rootQuestionId, rootQuestionIds)
  const isSelected = selectedMessageId === message.id

  const handleClick = () => {
    selectMessage(message.id)
    if (isUser) {
      loadRoutingDecision(message.id)
    }
  }

  const contextMenuItems: MenuProps['items'] = rootQuestions
    .filter((rq) => rq.id !== message.rootQuestionId)
    .map((rq) => ({
      key: rq.id,
      label: `Move to: ${rq.summary.slice(0, 40)}${rq.summary.length > 40 ? '...' : ''}`,
      onClick: () => {
        reassignMessage(message.id, rq.id)
        setContextMenuOpen(false)
      },
    }))

  return (
    <Dropdown
      menu={{ items: contextMenuItems }}
      trigger={['contextMenu']}
      open={contextMenuOpen}
      onOpenChange={setContextMenuOpen}
      disabled={contextMenuItems.length === 0}
    >
      <div
        onClick={handleClick}
        style={{
          display: 'flex',
          gap: 12,
          padding: '12px 16px',
          marginBottom: 8,
          borderRadius: 8,
          cursor: 'pointer',
          borderLeft: `3px solid ${color}`,
          backgroundColor: isSelected
            ? 'rgba(255,255,255,0.08)'
            : 'rgba(255,255,255,0.02)',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          if (!isSelected)
            (e.currentTarget as HTMLDivElement).style.backgroundColor =
              'rgba(255,255,255,0.05)'
        }}
        onMouseLeave={(e) => {
          if (!isSelected)
            (e.currentTarget as HTMLDivElement).style.backgroundColor =
              'rgba(255,255,255,0.02)'
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isUser ? '#1677ff' : '#52c41a',
            flexShrink: 0,
          }}
        >
          {isUser ? (
            <UserOutlined style={{ color: '#fff', fontSize: 14 }} />
          ) : (
            <RobotOutlined style={{ color: '#fff', fontSize: 14 }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.45)',
              marginBottom: 4,
            }}
          >
            {isUser ? 'You' : 'Assistant'}
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {message.content || (
              <span style={{ color: 'rgba(255,255,255,0.25)' }}>Thinking...</span>
            )}
          </div>
        </div>
      </div>
    </Dropdown>
  )
}
