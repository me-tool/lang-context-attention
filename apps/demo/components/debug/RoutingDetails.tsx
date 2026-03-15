'use client'

import { Collapse, Typography, Table, Tag } from 'antd'
import type { RoutingDecision } from '@lang-context/core'
import { useDebugStore } from '@/stores/debug'

const { Text, Paragraph } = Typography

interface Props {
  decision: RoutingDecision
}

export function RoutingDetails({ decision }: Props) {
  const { expandedSections, toggleSection } = useDebugStore()

  const activeKeys = Array.from(expandedSections)

  const candidateColumns = [
    {
      title: 'Root Question',
      dataIndex: 'rootQuestionId',
      key: 'rootQuestionId',
      render: (id: string) => (
        <Text code style={{ fontSize: 11 }}>
          {id.slice(0, 10)}...
        </Text>
      ),
    },
    {
      title: 'Vector',
      dataIndex: 'vectorScore',
      key: 'vectorScore',
      render: (v: number) => v.toFixed(4),
    },
    {
      title: 'BM25',
      dataIndex: 'bm25Score',
      key: 'bm25Score',
      render: (v: number) => v.toFixed(4),
    },
    {
      title: 'Fused',
      dataIndex: 'fusedScore',
      key: 'fusedScore',
      render: (v: number) => (
        <Tag color={v > 0.5 ? 'green' : v > 0.1 ? 'orange' : 'red'}>
          {v.toFixed(4)}
        </Tag>
      ),
    },
  ]

  const items = [
    {
      key: 'retrieval',
      label: `Retrieval Details (${decision.candidates.length} candidates)`,
      children: (
        <Table
          dataSource={decision.candidates}
          columns={candidateColumns}
          rowKey="rootQuestionId"
          size="small"
          pagination={false}
          style={{ fontSize: 12 }}
        />
      ),
    },
    {
      key: 'judgment',
      label: 'LLM Judgment',
      children: (
        <div>
          <div style={{ marginBottom: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Decision:
            </Text>{' '}
            <Tag color={decision.llmJudgment.isNew ? 'orange' : 'blue'}>
              {decision.llmJudgment.isNew ? 'New Topic' : 'Existing Topic'}
            </Tag>
          </div>
          <div style={{ marginBottom: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Reasoning:
            </Text>
            <Paragraph
              style={{
                color: 'rgba(255,255,255,0.65)',
                fontSize: 13,
                margin: '4px 0 0 0',
              }}
            >
              {decision.llmJudgment.reasoning}
            </Paragraph>
          </div>
          {decision.suggestedLinks.length > 0 && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Suggested Links:
              </Text>
              <div style={{ marginTop: 4 }}>
                {decision.suggestedLinks.map((id) => (
                  <Tag key={id} color="purple" style={{ marginBottom: 4 }}>
                    {id.slice(0, 12)}...
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'context',
      label: 'Context Preview',
      children: (
        <div>
          <div style={{ marginBottom: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Messages in context:
            </Text>{' '}
            <Text style={{ fontSize: 13 }}>
              {decision.assembledContext.messageIds.length}
            </Text>
          </div>
          <div style={{ marginBottom: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Estimated tokens:
            </Text>{' '}
            <Tag>{decision.assembledContext.estimatedTokens.toLocaleString()}</Tag>
          </div>
          {decision.assembledContext.messageIds.length > 0 && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Message IDs:
              </Text>
              <div style={{ marginTop: 4, maxHeight: 120, overflow: 'auto' }}>
                {decision.assembledContext.messageIds.map((id) => (
                  <Tag key={id} style={{ marginBottom: 2, fontSize: 11 }}>
                    {id.slice(0, 14)}...
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'timing',
      label: 'Timing',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Retrieval
            </Text>
            <Text style={{ fontSize: 13 }}>{decision.timing.retrievalMs.toFixed(1)}ms</Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              LLM Judgment
            </Text>
            <Text style={{ fontSize: 13 }}>{decision.timing.judgmentMs.toFixed(1)}ms</Text>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              paddingTop: 6,
            }}
          >
            <Text strong style={{ fontSize: 12 }}>
              Total
            </Text>
            <Text strong style={{ fontSize: 13 }}>
              {decision.timing.totalMs.toFixed(1)}ms
            </Text>
          </div>
        </div>
      ),
    },
  ]

  return (
    <Collapse
      activeKey={activeKeys}
      onChange={(keys) => {
        const keyArr = Array.isArray(keys) ? keys : [keys]
        // Sync expanded sections
        const allSections = ['retrieval', 'judgment', 'context', 'timing']
        for (const section of allSections) {
          const isExpanded = expandedSections.has(section)
          const shouldBeExpanded = keyArr.includes(section)
          if (isExpanded !== shouldBeExpanded) {
            toggleSection(section)
          }
        }
      }}
      items={items}
      size="small"
      style={{ fontSize: 12 }}
    />
  )
}
