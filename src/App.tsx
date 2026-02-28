import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useUnlink } from '@unlink-xyz/react'
import Header from './components/Header'
import WalletPopup from './components/WalletPopup'
import Toast from './components/Toast'
import InvoiceLayout from './components/InvoiceLayout'
import Home from './pages/Home'
import Profile from './pages/Profile'
import Wallet from './pages/Wallet'
import InvoiceDashboard from './pages/invoices/InvoiceDashboard'
import CreateInvoice from './pages/invoices/CreateInvoice'

function AppInner() {
  const { ready, walletExists, activeAccount, createAccount } = useUnlink()

  useEffect(() => {
    if (ready && walletExists && !activeAccount) {
      createAccount()
    }
  }, [ready, walletExists, activeAccount, createAccount])

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-nyx-bg">
        <div className="text-nyx-muted text-sm tracking-wide">Initializing...</div>
      </div>
    )
  }

  if (!walletExists) {
    return <WalletPopup />
  }

  if (!activeAccount) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-nyx-bg">
        <div className="text-nyx-muted text-sm tracking-wide">Setting up account...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-nyx-bg">
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/wallet" element={<Wallet />} />
        <Route path="/invoices" element={<InvoiceLayout />}>
          <Route index element={<InvoiceDashboard />} />
          <Route path="create" element={<CreateInvoice />} />
        </Route>
      </Routes>
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
