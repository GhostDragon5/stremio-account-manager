import { Button } from '@/components/ui/button'
import { useAccounts } from '@/hooks/useAccounts'
import { useUIStore } from '@/store/uiStore'
import { useAuthStore } from '@/store/authStore'
import { Download, Upload, Eye, EyeOff, User, LogOut } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

export function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const openExportDialog = useUIStore((state) => state.openExportDialog)
  const openImportDialog = useUIStore((state) => state.openImportDialog)
  const isPrivacyModeEnabled = useUIStore((state) => state.isPrivacyModeEnabled)
  const togglePrivacyMode = useUIStore((state) => state.togglePrivacyMode)
  const { accounts } = useAccounts()
  const { logout, isAuthenticated } = useAuthStore()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="border-b glass-card backdrop-blur-md sticky top-0 z-40">
      <div className="container mx-auto px-4 py-4 md:py-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight gradient-text">
              Stremio Account Manager
            </h1>
            <p className="hidden sm:block text-sm text-muted-foreground">
              Manage multiple Stremio accounts and addons
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {isAuthenticated && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/account')}
                className="flex-1 sm:flex-none liquid-glass"
              >
                <User className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">Account</span>
              </Button>
            )}
            {isAuthenticated && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="flex-1 sm:flex-none liquid-glass"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">Logout</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={togglePrivacyMode}
              title={isPrivacyModeEnabled ? 'Disable Privacy Mode' : 'Enable Privacy Mode'}
              className="flex-1 sm:flex-none liquid-glass"
            >
              {isPrivacyModeEnabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span className="hidden sm:inline ml-2">
                {isPrivacyModeEnabled ? 'Private' : 'Public'}
              </span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openImportDialog}
              className="flex-1 sm:flex-none liquid-glass"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline ml-2">Import</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openExportDialog}
              disabled={accounts.length === 0}
              className="flex-1 sm:flex-none liquid-glass"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline ml-2">Export</span>
            </Button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-4 mt-4 border-b border-white/10">
          <Link
            to="/"
            className={`pb-2 px-3 border-b-2 transition-colors duration-150 ${
              location.pathname === '/' || location.pathname.startsWith('/account/')
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            Accounts
          </Link>
          <Link
            to="/saved-addons"
            className={`pb-2 px-3 border-b-2 transition-colors duration-150 ${
              location.pathname === '/saved-addons'
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            Saved Addons
          </Link>
          <Link
            to="/faq"
            className={`pb-2 px-3 border-b-2 transition-colors duration-150 ${
              location.pathname === '/faq'
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            FAQ
          </Link>
        </div>
      </div>
    </header>
  )
}
