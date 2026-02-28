import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useUnlink } from '@unlink-xyz/react'
import Header from './components/Header'
import WalletPopup from './components/WalletPopup'
import Home from './pages/Home'
import Profile from './pages/Profile'

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
        <div className="text-nyx-muted text-sm">Initializing...</div>
      </div>
    )
  }

  if (!walletExists) {
    return <WalletPopup />
  }

  if (!activeAccount) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-nyx-bg">
        <div className="text-nyx-muted text-sm">Setting up account...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-nyx-bg">
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
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
