import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/hooks/use-toast'
import { getBackendUrl } from '@/lib/backendConfig'
import { Shield, Edit2, Save, X, LogOut, Key, QrCode, Copy, Download } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

interface User {
  id: string
  email: string
  created_at: string
  two_factor_enabled: boolean
}

function generateOtpAuthUri(secret: string, accountName: string): string {
  const issuer = 'StremioAccountManager'
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}

export function AccountPage() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [editingUsername, setEditingUsername] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [show2FADialog, setShow2FADialog] = useState(false)
  const [twoFactorSecret, setTwoFactorSecret] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [isVerifying2FA, setIsVerifying2FA] = useState(false)
  const [showBackupCodesDialog, setShowBackupCodesDialog] = useState(false)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  
  const navigate = useNavigate()
  const { user: authUser, logout } = useAuthStore()

  useEffect(() => {
    if (!authUser) {
      navigate('/login')
      return
    }
    loadUser()
  }, [authUser, navigate])

  const loadUser = async () => {
    if (!authUser) return
    try {
      const response = await fetch(`${getBackendUrl()}/api/users/${authUser.id}`)
      if (response.ok) {
        const data = await response.json()
        setUser(data)
        setNewUsername(data.email)
      }
    } catch (error) {
      console.error('Failed to load user:', error)
    }
  }

  const handleUpdateUsername = async () => {
    if (!authUser) return
    setIsLoading(true)
    try {
      const token = useAuthStore.getState().token
      const response = await fetch(`${getBackendUrl()}/api/users/${authUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ email: newUsername }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update username')
      }

      toast({
        title: 'Success',
        description: 'Username updated successfully',
      })
      setEditingUsername(false)
      loadUser()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update username'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggle2FA = async (enable: boolean) => {
    if (!authUser) return
    setIsLoading(true)
    try {
      const token = useAuthStore.getState().token
      
      if (enable) {
        // Generate secret but don't enable 2FA yet
        const secretBytes = new Uint8Array(20);
        crypto.getRandomValues(secretBytes);
        const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let secret = '';
        for (let i = 0; i < secretBytes.length; i += 5) {
          secret += base32Chars[secretBytes[i] >> 3];
          secret += base32Chars[((secretBytes[i] & 0x07) << 2) | (secretBytes[i + 1] >> 6)];
          secret += base32Chars[(secretBytes[i + 1] & 0x3F) >> 1];
          secret += base32Chars[((secretBytes[i + 1] & 0x01) << 4) | (secretBytes[i + 2] >> 4)];
          secret += base32Chars[(secretBytes[i + 2] & 0x0F) << 1 | (secretBytes[i + 3] >> 7)];
          secret += base32Chars[(secretBytes[i + 3] & 0x7F) >> 2];
          secret += base32Chars[((secretBytes[i + 3] & 0x03) << 3) | (secretBytes[i + 4] >> 5)];
          secret += base32Chars[secretBytes[i + 4] & 0x1F];
        }
        
        setTwoFactorSecret(secret)
        setShow2FADialog(true)
      } else {
        // Disable 2FA immediately
        const response = await fetch(`${getBackendUrl()}/api/users/${authUser.id}/disable-2fa`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to disable 2FA')
        }

        const result = await response.json()
        toast({
          title: 'Success',
          description: result.message,
        })
        loadUser()
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to toggle 2FA'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirm2FA = async () => {
    if (!authUser) return
    setIsVerifying2FA(true)
    try {
      const token = useAuthStore.getState().token
      
      // First verify the code with the secret
      const verifyResponse = await fetch(`${getBackendUrl()}/api/users/verify-2fa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          secret: twoFactorSecret,
          code: twoFactorCode 
        }),
      })

      if (!verifyResponse.ok) {
        const error = await verifyResponse.json()
        throw new Error(error.error || 'Invalid 2FA code')
      }

      const verifyResult = await verifyResponse.json()
      
      if (!verifyResult.valid) {
        throw new Error('Invalid 2FA code. Please check your authenticator app.')
      }

      // If code is valid, enable 2FA
      const enableResponse = await fetch(`${getBackendUrl()}/api/users/${authUser.id}/enable-2fa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ secret: twoFactorSecret }),
      })

      if (!enableResponse.ok) {
        const error = await enableResponse.json()
        throw new Error(error.error || 'Failed to enable 2FA')
      }

      const enableResult = await enableResponse.json()
      setBackupCodes(enableResult.backupCodes || [])
      setShow2FADialog(false)
      setTwoFactorCode('')
      setShowBackupCodesDialog(true)
      loadUser()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to enable 2FA'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setIsVerifying2FA(false)
    }
  }

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white gradient-text">Account Settings</h1>
            <p className="text-gray-400 text-sm sm:text-base">Manage your account settings and security</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button onClick={() => navigate('/change-password')} variant="outline" className="flex-1 sm:flex-none liquid-glass text-xs sm:text-sm">
              <Key className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Change Password</span>
              <span className="sm:hidden">Password</span>
            </Button>
            <Button onClick={logout} variant="destructive" className="flex-1 sm:flex-none liquid-glass text-xs sm:text-sm">
              <LogOut className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Logout</span>
              <span className="sm:hidden">Out</span>
            </Button>
          </div>
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-white">Profile</CardTitle>
            <CardDescription className="text-gray-400">Manage your account information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg liquid-glass gap-4">
                <div className="flex items-start sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 flex-shrink-0">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingUsername ? (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                        <Input
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          className="h-8 w-full sm:w-48 modern-input text-white placeholder:text-gray-400 text-sm"
                        />
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            onClick={handleUpdateUsername}
                            disabled={isLoading}
                            className="h-8 modern-button px-2"
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingUsername(false)
                              setNewUsername(user?.email || '')
                            }}
                            className="h-8 liquid-glass px-2"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="font-medium text-white text-sm sm:text-base truncate">{user?.email}</div>
                        <div className="text-xs sm:text-sm text-gray-400">
                          Created {new Date(user?.created_at || '').toLocaleDateString()}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {!editingUsername && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingUsername(true)}
                    className="liquid-glass w-full sm:w-auto"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg liquid-glass gap-4">
                <div className="flex items-start sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 flex-shrink-0">
                    <Key className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-white text-sm sm:text-base">Two-Factor Authentication</div>
                    <div className="text-xs sm:text-sm text-gray-400">
                      {user?.two_factor_enabled ? '2FA is enabled' : '2FA is disabled'}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleToggle2FA(!user?.two_factor_enabled)}
                  disabled={isLoading}
                  className="liquid-glass w-full sm:w-auto text-sm"
                >
                  {user?.two_factor_enabled ? 'Disable 2FA' : 'Enable 2FA'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* 2FA Secret Dialog */}
        <Dialog open={show2FADialog} onOpenChange={setShow2FADialog}>
          <DialogContent className="glass-card w-[calc(100%-2rem)] max-w-md mx-auto sm:mx-4">
            <DialogHeader>
              <DialogTitle className="text-white text-lg sm:text-xl">Setup Two-Factor Authentication</DialogTitle>
              <DialogDescription className="text-gray-400 text-sm">
                Enter the code from your authenticator app to verify the setup.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-4 p-4 bg-primary/10 rounded-lg">
                <div className="flex items-center gap-2 text-white">
                  <QrCode className="h-5 w-5" />
                  <span className="font-medium">Scan QR Code</span>
                </div>
                <QRCodeSVG
                  value={generateOtpAuthUri(twoFactorSecret, user?.email || 'Stremio Account')}
                  size={Math.min(180, window.innerWidth - 100)}
                  level="M"
                  includeMargin
                />
              </div>
              <div className="p-4 bg-primary/10 rounded-lg">
                <p className="text-sm text-gray-400 mb-2">Or enter this secret manually:</p>
                <p className="text-base sm:text-lg font-mono text-white break-all">{twoFactorSecret}</p>
              </div>
              <p className="text-sm text-gray-400">
                1. Scan the QR code with your authenticator app<br/>
                2. Enter the 6-digit code below to verify
              </p>
              <div className="space-y-2">
                <Label htmlFor="twoFactorCode" className="text-gray-300">Verification Code</Label>
                <Input
                  id="twoFactorCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="123456"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  className="modern-input text-white placeholder:text-gray-400 text-center text-lg tracking-widest"
                />
              </div>
              <div className="flex flex-col sm:flex-row justify-end gap-2">
                <Button
                  onClick={() => {
                    setShow2FADialog(false)
                    setTwoFactorCode('')
                  }}
                  variant="outline"
                  className="w-full sm:w-auto liquid-glass"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirm2FA}
                  disabled={isVerifying2FA || twoFactorCode.length !== 6}
                  className="w-full sm:w-auto modern-button"
                >
                  {isVerifying2FA ? 'Verifying...' : 'Verify & Enable'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Backup Codes Dialog */}
        <Dialog open={showBackupCodesDialog} onOpenChange={setShowBackupCodesDialog}>
          <DialogContent className="glass-card w-[calc(100%-2rem)] max-w-md mx-auto sm:mx-4">
            <DialogHeader>
              <DialogTitle className="text-white text-lg sm:text-xl">Backup Codes</DialogTitle>
              <DialogDescription className="text-gray-400 text-sm">
                Save these codes. Each can only be used once.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:gap-3 p-3 sm:p-4 bg-primary/10 rounded-lg">
                {backupCodes.map((code, index) => (
                  <div key={index} className="font-mono text-white bg-black/30 p-2 rounded text-center text-xs sm:text-sm">
                    {code}
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(backupCodes.join('\n'))
                    toast({
                      title: 'Copied!',
                      description: 'Backup codes copied to clipboard',
                    })
                  }}
                  variant="outline"
                  className="flex-1 liquid-glass text-sm"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </Button>
                <Button
                  onClick={() => {
                    const element = document.createElement('a')
                    const textFile = new Blob([backupCodes.join('\n')], { type: 'text/plain' })
                    element.href = URL.createObjectURL(textFile)
                    element.download = `backup-codes-${user?.email || 'account'}.txt`
                    document.body.appendChild(element)
                    element.click()
                    document.body.removeChild(element)
                    toast({
                      title: 'Downloaded!',
                      description: 'Backup codes downloaded as file',
                    })
                  }}
                  variant="outline"
                  className="flex-1 liquid-glass text-sm"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
              <p className="text-xs sm:text-sm text-yellow-500">
                Warning: You will not be able to see these codes again after closing.
              </p>
              <Button
                onClick={() => setShowBackupCodesDialog(false)}
                className="w-full modern-button text-sm"
              >
                I've saved my codes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}