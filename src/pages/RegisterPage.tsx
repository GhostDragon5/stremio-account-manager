import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/hooks/use-toast'

export function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  
  const navigate = useNavigate()
  const { register } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast({
        title: 'Error',
        description: 'Passwords do not match',
        variant: 'destructive',
      })
      return
    }

    if (password.length < 6) {
      toast({
        title: 'Error',
        description: 'Password must be at least 6 characters',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)

    try {
      await register(email, password)
      toast({
        title: 'Success',
        description: 'Your account has been created successfully',
      })
      navigate('/')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Registration failed'
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
            <CardTitle className="text-2xl font-bold text-white">Create Account</CardTitle>
            <CardDescription className="text-gray-400">
              Enter your details to create a new account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-300">Username</Label>
                <Input
                  id="email"
                  type="text"
                  placeholder="username"
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
                  minLength={6}
                  className="modern-input text-white placeholder:text-gray-400"
                />
                <p className="text-sm text-gray-400">
                  Password must be at least 6 characters
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-gray-300">Confirm Password</Label>
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
                {isLoading ? 'Creating account...' : 'Create Account'}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm">
              <span className="text-gray-400">Already have an account? </span>
              <Button
                variant="link"
                className="p-0 h-auto font-normal text-gray-300"
                onClick={() => navigate('/login')}
              >
                Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}