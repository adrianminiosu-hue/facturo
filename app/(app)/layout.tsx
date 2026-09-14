'use client'
import { CompanyProvider } from '@/components/CompanyProvider'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <CompanyProvider>{children}</CompanyProvider>
}
