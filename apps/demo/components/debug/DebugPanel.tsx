'use client'

import { Typography, Tag, Empty } from 'antd'
import { BugOutlined } from '@ant-design/icons'
import { useUiStore } from '@/stores/ui'
import { useDebugStore } from '@/stores/debug'
import { RoutingDetails } from './RoutingDetails'

const { Title, Text } = Typography

export function DebugPanel() {
  const { selectedMessageId } = useUiStore()
  const { currentRoutingDecision } = useDebugStore()

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <BugOutlined style={{ color: '#1677ff' }} />
        <Title level={5} style={{ color: 'rgba(255,255,255,0.85)', margin: 0 }}>
          Debug Panel
        </Title>
      </div>

      {!selectedMessageId ? (
        <Empty
          description="Click a message to inspect its routing decision"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : !currentRoutingDecision ? (
        <div style={{ padding: '16px 0' }}>
          <Text type="secondary">
            No routing decision found for this message.
          </Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Only user messages have routing decisions.
          </Text>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Target</Text>
            <div>
              <Tag color="blue">{currentRoutingDecision.finalTarget.slice(0, 12)}...</Tag>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Confidence</Text>
            <div>
              <ConfidenceIndicator decision={currentRoutingDecision} />
            </div>
          </div>
          <RoutingDetails decision={currentRoutingDecision} />
        </>
      )}
    </div>
  )
}

function ConfidenceIndicator({
  decision,
}: {
  decision: NonNullable<ReturnType<typeof useDebugStore.getState>['currentRoutingDecision']>
}) {
  const topScore = decision.candidates[0]?.fusedScore ?? 0
  const isNew = decision.llmJudgment.isNew

  let color: string
  let label: string

  if (isNew) {
    color = '#faad14'
    label = 'New Topic'
  } else if (topScore > 0.5) {
    color = '#52c41a'
    label = `High (${topScore.toFixed(3)})`
  } else if (topScore > 0.1) {
    color = '#faad14'
    label = `Medium (${topScore.toFixed(3)})`
  } else {
    color = '#f5222d'
    label = `Low (${topScore.toFixed(3)})`
  }

  return (
    <Tag
      color={color}
      style={{ marginTop: 4 }}
    >
      {label}
    </Tag>
  )
}
