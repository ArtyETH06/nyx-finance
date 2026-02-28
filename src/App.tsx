import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useUnlink } from '@unlink-xyz/react'
import { Loader2 } from 'lucide-react'
import Header from './components/Header'
import Footer from './components/Footer'
import WalletPopup from './components/WalletPopup'
import Toast from './components/Toast'
import InvoiceLayout from './components/InvoiceLayout'
import Home from './pages/Home'
import Profile from './pages/Profile'
import Wallet from './pages/Wallet'
import InvoiceDashboard from './pages/invoices/InvoiceDashboard'
import CreateInvoice from './pages/invoices/CreateInvoice'
import InvoiceDetail from './pages/invoices/InvoiceDetail'

function FullscreenLoader({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-nyx-bg">
      <div className="flex items-center gap-3 text-nyx-muted text-sm tracking-wide">
        <Loader2 size={18} className="animate-spin text-nyx-accent" />
        <span>{label}</span>
      </div>
    </div>
  )
}

function AppInner() {
  const { ready, walletExists, activeAccount, createAccount } = useUnlink()

  useEffect(() => {
    if (ready && walletExists && !activeAccount) {
      createAccount()
    }
  }, [ready, walletExists, activeAccount, createAccount])

  if (!ready) {
    return <FullscreenLoader label="Initializing..." />
  }

  if (!walletExists) {
    return <WalletPopup />
  }

  if (!activeAccount) {
    return <FullscreenLoader label="Setting up account..." />
  }

  return (
    <div className="min-h-screen bg-nyx-bg flex flex-col">
      <Header />
      <div className="flex-1 min-h-0">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/invoices" element={<InvoiceLayout />}>
            <Route index element={<InvoiceDashboard />} />
            <Route path="create" element={<CreateInvoice />} />
            <Route path=":id" element={<InvoiceDetail />} />
          </Route>
        </Routes>
      </div>
      <Footer />
      <Toast />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  )
}
