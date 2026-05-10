import { ReactNode } from 'react'
import { Footer } from './Footer'
import { Header } from './Header'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #0f0f13 0%, #121416 25%, #1a1d23 50%, #121416 75%, #0f0f13 100%)' }}>
      <Header />
      <main className="container mx-auto px-4 py-10 flex-1">{children}</main>
      <Footer />
    </div>
  )
}
