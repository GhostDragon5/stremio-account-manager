import { AccountForm } from '@/components/accounts/AccountForm'
import { AddonInstaller } from '@/components/addons/AddonInstaller'
import { ExportDialog } from '@/components/ExportDialog'
import { ImportDialog } from '@/components/ImportDialog'
import { Layout } from '@/components/layout/Layout'
import { Toaster } from '@/components/ui/toaster'
import { AppRoutes } from '@/routes'
import { useAccountStore } from '@/store/accountStore'
import { useAddonStore } from '@/store/addonStore'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

function App() {
  const initializeAccounts = useAccountStore((state: any) => state.initialize)
  const initializeAddons = useAddonStore((state: any) => state.initialize)
  const initializeAuth = useAuthStore((state: any) => state.initialize)
  const initializeUI = useUIStore((state: any) => state.initialize)
  const isAuthenticated = useAuthStore((state: any) => state.isAuthenticated)
  const checkAuth = useAuthStore((state: any) => state.checkAuth)
  const [isReady, setIsReady] = useState(false)
  const location = useLocation()

  useEffect(() => {
    initializeUI()
    initializeAuth()
    checkAuth()
    setIsReady(true)
  }, [initializeAuth, initializeUI, checkAuth])

  useEffect(() => {
    if (!isReady || !isAuthenticated) return

    const loadData = async () => {
      try {
        await Promise.all([initializeAccounts(), initializeAddons()])
      } catch (error) {
        console.error('Failed to initialize accounts/addons after login:', error)
      }
    }

    loadData()
  }, [isReady, isAuthenticated, initializeAccounts, initializeAddons])

  if (!isReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Loading...</h2>
          <p className="text-muted-foreground">Initializing Stremio Account Manager</p>
        </div>
      </div>
    )
  }

  // Check if user is on auth pages (login/register/change-password only)
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/change-password'

  // Redirect to login if not authenticated and not on auth pages
  if (!isAuthenticated && !isAuthPage) {
    console.log('App - Not authenticated, redirecting to login')
    return <Navigate to="/login" replace />
  }

  // Redirect to login if not authenticated and on change-password page
  if (!isAuthenticated && location.pathname === '/change-password') {
    console.log('App - Not authenticated on change-password page, redirecting to login')
    return <Navigate to="/login" replace />
  }

  // CRITICAL: Force password change for default admin
  const storedUser = localStorage.getItem('user')
  const parsedUser = storedUser ? JSON.parse(storedUser) : null
  const isDefaultAdmin = parsedUser?.is_default_admin === true
  
  if (isAuthenticated && isDefaultAdmin && location.pathname !== '/change-password') {
    console.log('App - Default admin detected, forcing password change')
    return <Navigate to="/change-password" replace />
  }

  // Redirect to home if authenticated and on auth pages (except change-password for default admin)
  if (isAuthenticated && (location.pathname === '/login' || location.pathname === '/register')) {
    console.log('App - Authenticated on auth page, redirecting to home')
    return <Navigate to="/" replace />
  }

  // Don't show layout on auth pages (including change-password)
  if (isAuthPage) {
    return (
      <>
        <AppRoutes />
        <Toaster />
      </>
    )
  }

  // Show layout for other authenticated pages
  return (
    <Layout>
      <AppRoutes />

      <AccountForm />
      <AddonInstaller />
      <ExportDialog />
      <ImportDialog />
      <Toaster />
    </Layout>
  )
}

export default App
