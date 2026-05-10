import { Routes, Route, Navigate } from 'react-router-dom'
import { AccountsPage } from '@/pages/AccountsPage'
import { AccountDetailPage } from '@/pages/AccountDetailPage'
import { SavedAddonsPage } from '@/pages/SavedAddonsPage'
import { FAQPage } from '@/pages/FAQPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { ChangePasswordPage } from '@/pages/ChangePasswordPage'
import { AccountPage } from '@/pages/AccountPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AccountsPage />} />
      <Route path="/saved-addons" element={<SavedAddonsPage />} />
      <Route path="/faq" element={<FAQPage />} />
      <Route path="/account/:accountId" element={<AccountDetailPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  )
}
