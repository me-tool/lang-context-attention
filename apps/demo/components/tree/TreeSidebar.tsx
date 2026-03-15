'use client'

import { Button, Typography, Divider } from 'antd'
import { AppstoreOutlined } from '@ant-design/icons'
import { useUiStore } from '@/stores/ui'
import { useSessionStore } from '@/stores/session'
import { RootQuestionItem } from './RootQuestionItem'

const { Title } = Typography

export function TreeSidebar() {
  const { selectedRootQuestionId, selectRootQuestion } = useUiStore()
  const { rootQuestions } = useSessionStore()

  return (
    <div style={{ padding: 16 }}>
      <Title level={5} style={{ color: 'rgba(255,255,255,0.85)', margin: '0 0 12px 0' }}>
        Topics
      </Title>
      <Button
        type={selectedRootQuestionId === null ? 'primary' : 'text'}
        icon={<AppstoreOutlined />}
        block
        style={{ textAlign: 'left', marginBottom: 8 }}
        onClick={() => selectRootQuestion(null)}
      >
        All Messages
      </Button>
      <Divider style={{ margin: '8px 0', borderColor: 'rgba(255,255,255,0.08)' }} />
      {rootQuestions.map((rq, index) => (
        <RootQuestionItem
          key={rq.id}
          rootQuestion={rq}
          index={index}
          isSelected={selectedRootQuestionId === rq.id}
          onClick={() => selectRootQuestion(rq.id)}
        />
      ))}
      {rootQuestions.length === 0 && (
        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, padding: '8px 0' }}>
          No topics yet. Start chatting to create one.
        </div>
      )}
    </div>
  )
}
