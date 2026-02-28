import { useEffect } from 'react'
import { BrowserRouter, Link, Routes, Route, useLocation } from 'react-router-dom'
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
import PayInvoice from './pages/pay/PayInvoice'
import nyxLogo from './images/logo.png'

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
  const location = useLocation()
  const isPublicPayRoute = /^\/pay\/[^/]+$/.test(location.pathname)
  const isPublicInvoiceRoute = /^\/invoices\/[^/]+$/.test(location.pathname)
  const isPublicRoute = isPublicPayRoute || isPublicInvoiceRoute

  useEffect(() => {
    if (!isPublicRoute && ready && walletExists && !activeAccount) {
      createAccount()
    }
  }, [isPublicRoute, ready, walletExists, activeAccount, createAccount])

  if (isPublicRoute) {
    return (
      <div className="min-h-screen bg-nyx-bg flex flex-col">
        <header className="px-6 py-4 bg-nyx-bg border-b border-[rgba(255,255,255,0.06)]">
          <div className="justify-self-start">
            <Link to="/" className="flex flex-col leading-tight group">
              <img
                src={nyxLogo}
                alt="NYX"
                className="h-9 w-auto object-contain mb-0.5 opacity-95 group-hover:opacity-100 transition-opacity duration-150"
              />
              <span className="text-[11px] text-nyx-muted tracking-wide">
                Public blockchain. Private business.
              </span>
            </Link>
          </div>
        </header>
        <div className="flex-1 min-h-0">
          <Routes>
            <Route path="/pay/:id" element={<PayInvoice />} />
            <Route path="/invoices/:id" element={<InvoiceDetail />} />
          </Routes>
        </div>
        <Footer />
        <Toast />
      </div>
    )
  }

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
          <Route path="/pay/:id" element={<PayInvoice />} />
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
