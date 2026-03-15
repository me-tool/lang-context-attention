'use client'

import { Alert, Button, Space } from 'antd'
import { LinkOutlined } from '@ant-design/icons'
import { useSessionStore } from '@/stores/session'

export function LinkBanner() {
  const { linkSuggestions, linkQuestions, dismissLinkSuggestion } = useSessionStore()

  // Show only the first suggestion (queue mechanism)
  const suggestion = linkSuggestions[0]
  if (!suggestion) return null

  const handleLink = async () => {
    await linkQuestions(suggestion.sourceId, suggestion.targetId)
    dismissLinkSuggestion(0)
  }

  const handleIgnore = () => {
    dismissLinkSuggestion(0)
  }

  return (
    <div style={{ padding: '8px 24px 0' }}>
      <Alert
        type="info"
        showIcon
        icon={<LinkOutlined />}
        message={
          <span>
            This question may be related to{' '}
            <strong>&quot;{suggestion.targetSummary.slice(0, 60)}{suggestion.targetSummary.length > 60 ? '...' : ''}&quot;</strong>.
            Link them?
          </span>
        }
        action={
          <Space>
            <Button size="small" type="primary" onClick={handleLink}>
              Link
            </Button>
            <Button size="small" onClick={handleIgnore}>
              Ignore
            </Button>
          </Space>
        }
        closable={false}
        style={{ marginBottom: 0 }}
      />
    </div>
  )
}
