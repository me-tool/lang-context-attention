import type { Metadata } from 'next'
import { AntdRegistry } from '@ant-design/nextjs-registry'
import { AntdProvider } from '@/components/AntdProvider'

export const metadata: Metadata = {
  title: 'Lang Context Attention - Demo',
  description: 'Multi-topic conversation routing demo',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>
        <AntdRegistry>
          <AntdProvider>{children}</AntdProvider>
        </AntdRegistry>
      </body>
    </html>
  )
}
