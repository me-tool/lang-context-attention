'use client'

import { Badge, Button } from 'antd'
import { MessageOutlined } from '@ant-design/icons'
import type { RootQuestion } from '@lang-context/core'
import { getTopicColor } from '@/lib/colors'

interface Props {
  rootQuestion: RootQuestion
  index: number
  isSelected: boolean
  onClick: () => void
}

export function RootQuestionItem({ rootQuestion, index, isSelected, onClick }: Props) {
  const color = getTopicColor(index)

  return (
    <Button
      type={isSelected ? 'primary' : 'text'}
      block
      onClick={onClick}
      style={{
        textAlign: 'left',
        marginBottom: 4,
        height: 'auto',
        padding: '8px 12px',
        borderLeft: `3px solid ${color}`,
        whiteSpace: 'normal',
        lineHeight: 1.4,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            fontSize: 13,
            flex: 1,
          }}
        >
          {rootQuestion.summary}
        </span>
        <Badge
          count={rootQuestion.messageCount}
          size="small"
          style={{ marginLeft: 8, backgroundColor: color }}
        >
          <MessageOutlined style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)' }} />
        </Badge>
      </div>
    </Button>
  )
}
