import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuthStore } from '@/store/authStore'
import { getBackendUrl } from '@/lib/backendConfig'
import { toast } from '@/hooks/use-toast'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [showTwoFactor, setShowTwoFactor] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [recoveryStep, setRecoveryStep] = useState<'email' | 'code'>('email')
  const [isRecovering, setIsRecovering] = useState(false)
  
  const navigate = useNavigate()
  const { login } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      console.log('=== LoginPage Login Process ===')
      console.log('LoginPage - Starting login process')
      console.log('LoginPage - Email:', email)
      
      const user = await login(email, password, twoFactorCode || undefined)
      console.log('LoginPage - Login successful, user:', user)
      
      // CRITICAL: Verify user is in localStorage BEFORE navigation
      console.log('LoginPage - Checking localStorage...')
      const storedUser = localStorage.getItem('user')
      console.log('LoginPage - User in localStorage after login:', storedUser)
      
      if (!storedUser) {
        console.error('LoginPage - CRITICAL ERROR: User not found in localStorage after login!')
        console.error('LoginPage - This should never happen!')
        throw new Error('Login failed - user not stored in localStorage')
      }
      
      // Parse and verify the stored user
      try {
        const parsedStoredUser = JSON.parse(storedUser)
        console.log('LoginPage - Parsed stored user:', parsedStoredUser)
        console.log('LoginPage - Stored user ID:', parsedStoredUser.id)
        console.log('LoginPage - Stored user email:', parsedStoredUser.email)
        
        if (!parsedStoredUser.id) {
          console.error('LoginPage - CRITICAL ERROR: Stored user has no ID!')
          throw new Error('Login failed - stored user has no ID')
        }
      } catch (parseError) {
        console.error('LoginPage - CRITICAL ERROR: Failed to parse stored user:', parseError)
        throw new Error('Login failed - invalid stored user data')
      }
      
      // Wait a moment to ensure everything is updated
      console.log('LoginPage - Waiting 500ms for store update...')
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Final verification
      const finalStoredUser = localStorage.getItem('user')
      console.log('LoginPage - Final verification - User in localStorage:', finalStoredUser)
      
      if (!finalStoredUser) {
        console.error('LoginPage - CRITICAL ERROR: User disappeared from localStorage!')
        throw new Error('Login failed - user disappeared from localStorage')
      }
      
      // Check if it's the default admin account
      if (user && user.user && user.user.is_default_admin) {
        console.log('LoginPage - Default admin detected, redirecting to change-password')
        toast({
          title: 'Security Warning',
          description: 'You are using the default admin credentials. Please change your password immediately.',
          variant: 'destructive',
        })
        console.log('LoginPage - Navigating to /change-password')
        navigate('/change-password')
      } else {
        console.log('LoginPage - Regular user, redirecting to home')
        toast({
          title: 'Success',
          description: 'You have been logged in successfully',
        })
        console.log('LoginPage - Navigating to /')
        navigate('/')
      }
    } catch (error) {
      console.error('LoginPage - Login error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Login failed'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
      
      // If 2FA is required, show the 2FA input
      if (errorMessage.includes('Two-factor code required')) {
        setShowTwoFactor(true)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleRecoveryRequest = async () => {
    if (!recoveryEmail) return
    setIsRecovering(true)
    try {
      const response = await fetch(
        `${getBackendUrl()}/api/users/recovery-code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: recoveryEmail }),
        }
      )
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send recovery code')
      }
      
      toast({
        title: 'Code Sent',
        description: 'Check your email for the backup code.',
      })
      setRecoveryStep('code')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send recovery code'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setIsRecovering(false)
    }
  }

  const handleRecoveryVerify = async () => {
    if (!recoveryCode || !recoveryEmail) return
    setIsRecovering(true)
    try {
      const response = await fetch(
        `${getBackendUrl()}/api/users/verify-backup-code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: recoveryEmail, backupCode: recoveryCode }),
        }
      )
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Invalid backup code')
      }
      
      toast({
        title: 'Code Verified',
        description: 'Your backup code was valid. You can now login with this code as your 2FA code.',
      })
      setShowRecovery(false)
      setRecoveryEmail('')
      setRecoveryCode('')
      setRecoveryStep('email')
      setShowTwoFactor(true)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid backup code'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setIsRecovering(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #0f0f13 0%, #121416 25%, #1a1d23 50%, #121416 75%, #0f0f13 100%)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2 gradient-text">Stremio Account Manager</h1>
          <p className="text-gray-400">Manage multiple Stremio accounts and addons</p>
        </div>
        
        <Card className="glass-card">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-white">Login</CardTitle>
            <CardDescription className="text-gray-400">
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-300">Username</Label>
                <Input
                  id="email"
                  type="text"
                  placeholder="admin"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  className="modern-input text-white placeholder:text-gray-400"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-300">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="modern-input text-white placeholder:text-gray-400"
                />
              </div>
              {showTwoFactor && (
                <div className="space-y-2">
                  <Label htmlFor="twoFactorCode" className="text-gray-300">Two-Factor Code</Label>
                  <Input
                    id="twoFactorCode"
                    type="text"
                    placeholder="123456"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value)}
                    maxLength={6}
                    disabled={isLoading}
                    className="modern-input text-white placeholder:text-gray-400"
                  />
                  <p className="text-sm text-gray-400">
                    Enter the 6-digit code from your authenticator app
                  </p>
                </div>
              )}
              <Button type="submit" className="w-full modern-button" disabled={isLoading}>
                {isLoading ? 'Logging in...' : 'Login'}
              </Button>
              <button
                type="button"
                onClick={() => setShowRecovery(true)}
                className="text-sm text-gray-400 hover:text-white underline-offset-2 hover:underline"
              >
                Account Recovery
              </button>
            </form>

            {/* Account Recovery Dialog */}
            <Dialog open={showRecovery} onOpenChange={setShowRecovery}>
              <DialogContent className="glass-card max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-white">Account Recovery</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    {recoveryStep === 'email'
                      ? 'Enter your username to recover your account.'
                      : 'Enter the backup code you received when setting up 2FA.'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {recoveryStep === 'email' ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="recoveryEmail" className="text-gray-300">Username</Label>
                        <Input
                          id="recoveryEmail"
                          type="text"
                          placeholder="admin"
                          value={recoveryEmail}
                          onChange={(e) => setRecoveryEmail(e.target.value)}
                          className="modern-input text-white placeholder:text-gray-400"
                        />
                      </div>
                      <Button
                        onClick={handleRecoveryRequest}
                        disabled={isRecovering || !recoveryEmail}
                        className="w-full modern-button"
                      >
                        {isRecovering ? 'Sending...' : 'Next'}
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="recoveryCode" className="text-gray-300">Backup Code</Label>
                        <Input
                          id="recoveryCode"
                          type="text"
                          placeholder="XXXX-XXXX"
                          value={recoveryCode}
                          onChange={(e) => setRecoveryCode(e.target.value)}
                          className="modern-input text-white placeholder:text-gray-400"
                        />
                      </div>
                      <Button
                        onClick={handleRecoveryVerify}
                        disabled={isRecovering || !recoveryCode}
                        className="w-full modern-button"
                      >
                        {isRecovering ? 'Verifying...' : 'Verify & Recover'}
                      </Button>
                      <button
                        type="button"
                        onClick={() => {
                          setRecoveryStep('email')
                          setRecoveryCode('')
                        }}
                        className="text-sm text-gray-400 hover:text-white"
                      >
                        Use a different username
                      </button>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}