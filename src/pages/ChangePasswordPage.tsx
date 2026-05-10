import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'
import { useAuthStore } from '@/store/authStore'
import { getBackendUrl } from '@/lib/backendConfig'

export function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  
  const navigate = useNavigate()
  const { user: storeUser, setUser: setStoreUser } = useAuthStore()
  
  // Load user from localStorage on mount
  useEffect(() => {
    console.log('=== ChangePasswordPage Mount ===')
    console.log('ChangePasswordPage - Checking localStorage...')
    
    const loadUser = () => {
      try {
        const storedUser = localStorage.getItem('user')
        console.log('ChangePasswordPage - localStorage.getItem("user"):', storedUser)
        
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser)
          console.log('ChangePasswordPage - Parsed user:', parsedUser)
          console.log('ChangePasswordPage - User ID:', parsedUser.id)
          console.log('ChangePasswordPage - User email:', parsedUser.email)
          setStoreUser(parsedUser)
          setIsCheckingAuth(false)
        } else {
          console.log('ChangePasswordPage - ERROR: No user found in localStorage')
          console.log('ChangePasswordPage - Redirecting to login')
          setIsCheckingAuth(false)
          // Redirect to login if no user found
          setTimeout(() => navigate('/login'), 100)
        }
      } catch (error) {
        console.error('ChangePasswordPage - ERROR: Error parsing user from localStorage:', error)
        console.log('ChangePasswordPage - Redirecting to login')
        setIsCheckingAuth(false)
        setTimeout(() => navigate('/login'), 100)
      }
    }
    
    loadUser()
  }, [navigate, setStoreUser])
  
  // Show loading while checking auth
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #0f0f13 0%, #121416 25%, #1a1d23 50%, #121416 75%, #0f0f13 100%)' }}>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2 gradient-text">Loading...</h2>
          <p className="text-gray-400">Verifying authentication...</p>
        </div>
      </div>
    )
  }
  
  // Show error if no user found
  if (!storeUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #0f0f13 0%, #121416 25%, #1a1d23 50%, #121416 75%, #0f0f13 100%)' }}>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2 gradient-text">Authentication Required</h2>
          <p className="text-gray-400 mb-4">Please login to change your password</p>
          <Button onClick={() => navigate('/login')} className="modern-button">Go to Login</Button>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    console.log('=== ChangePasswordPage.handleSubmit ===')
    console.log('ChangePasswordPage - Current user state:', storeUser)
    console.log('ChangePasswordPage - User ID:', storeUser?.id)
    console.log('ChangePasswordPage - User email:', storeUser?.email)

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Error',
        description: 'Passwords do not match',
        variant: 'destructive',
      })
      return
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Error',
        description: 'Password must be at least 6 characters',
        variant: 'destructive',
      })
      return
    }

    if (!storeUser?.id) {
      console.error('ChangePasswordPage - CRITICAL ERROR: User ID is missing!')
      console.error('ChangePasswordPage - User object:', storeUser)
      console.error('ChangePasswordPage - This should never happen if auth check passed!')
      toast({
        title: 'Error',
        description: 'User ID not found. Please login again.',
        variant: 'destructive',
      })
      // Redirect to login after showing error
      setTimeout(() => navigate('/login'), 2000)
      return
    }

    setIsLoading(true)

    try {
      console.log('ChangePasswordPage - Sending password change request')
      console.log('ChangePasswordPage - User ID:', storeUser.id)
      console.log('ChangePasswordPage - Current password length:', currentPassword.length)
      console.log('ChangePasswordPage - New password length:', newPassword.length)
      
      const response = await fetch(`${getBackendUrl()}/api/users/${storeUser.id}/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore.getState().token}`,
        },
        body: JSON.stringify({ 
          currentPassword, 
          newPassword 
        }),
      })

      console.log('ChangePasswordPage - Response status:', response.status)

      if (!response.ok) {
        const error = await response.json()
        console.error('ChangePasswordPage - Error response:', error)
        throw new Error(error.error || 'Password change failed')
      }

      const result = await response.json()
      console.log('ChangePasswordPage - Success response:', result)

      toast({
        title: 'Success',
        description: 'Your password has been changed successfully',
      })
      
      // CRITICAL: Remove the is_default_admin flag from localStorage to allow access
      const updatedUser = { ...storeUser, is_default_admin: false }
      localStorage.setItem('user', JSON.stringify(updatedUser))
      console.log('ChangePasswordPage - Removed is_default_admin flag from localStorage')
      
      // CRITICAL: Update the store to reflect the change immediately
      console.log('ChangePasswordPage - Updating store with updated user')
      setStoreUser(updatedUser)
      
      console.log('ChangePasswordPage - Navigating to home')
      navigate('/')
    } catch (error) {
      console.error('ChangePasswordPage - Error during password change:', error)
      const errorMessage = error instanceof Error ? error.message : 'Password change failed'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
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
            <CardTitle className="text-2xl font-bold text-white">Change Password</CardTitle>
            <CardDescription className="text-gray-400">
              Change your password to secure your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword" className="text-gray-300">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  placeholder="••••••••"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="modern-input text-white placeholder:text-gray-400"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-gray-300">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  minLength={6}
                  className="modern-input text-white placeholder:text-gray-400"
                />
                <p className="text-sm text-gray-400">
                  Password must be at least 6 characters
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-gray-300">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  minLength={6}
                  className="modern-input text-white placeholder:text-gray-400"
                />
              </div>
              <Button type="submit" className="w-full modern-button" disabled={isLoading}>
                {isLoading ? 'Changing password...' : 'Change Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}