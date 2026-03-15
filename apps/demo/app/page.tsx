'use client'

import { useEffect, useCallback, useRef } from 'react'
import { Layout } from 'antd'
import { TreeSidebar } from '@/components/tree/TreeSidebar'
import { ChatArea } from '@/components/chat/ChatArea'
import { DebugPanel } from '@/components/debug/DebugPanel'
import { LinkBanner } from '@/components/LinkBanner'
import { useUiStore } from '@/stores/ui'
import { useSessionStore } from '@/stores/session'

const { Sider, Content } = Layout

export default function HomePage() {
  const { treeSidebarVisible, debugPanelVisible, toggleTreeSidebar, toggleDebugPanel } =
    useUiStore()
  const { session, createSession } = useSessionStore()

  // Auto-create session on mount if none exists (guard against StrictMode double-call)
  const sessionInitRef = useRef(false)
  useEffect(() => {
    if (!session && !sessionInitRef.current) {
      sessionInitRef.current = true
      createSession('You are a helpful assistant.', 'Demo Session')
    }
  }, [session, createSession])

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        toggleTreeSidebar()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault()
        toggleDebugPanel()
      }
    },
    [toggleTreeSidebar, toggleDebugPanel]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      {treeSidebarVisible && (
        <Sider
          width={280}
          theme="dark"
          style={{
            borderRight: '1px solid rgba(255,255,255,0.08)',
            overflow: 'auto',
          }}
        >
          <TreeSidebar />
        </Sider>
      )}
      <Content
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <LinkBanner />
        <ChatArea />
      </Content>
      {debugPanelVisible && (
        <Sider
          width={360}
          theme="dark"
          style={{
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            overflow: 'auto',
          }}
        >
          <DebugPanel />
        </Sider>
      )}
    </Layout>
  )
}
