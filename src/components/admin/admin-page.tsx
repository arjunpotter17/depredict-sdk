'use client'

import React from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useShortx } from '@/components/solana/useDepredict'
import { CreateMarketCreatorFlow } from './create-market-creator-flow'
import { MarketCreatorDashboard } from './market-creator-dashboard'
import { Loader2, ArrowLeft, AlertCircle, Wallet } from 'lucide-react'
import { useAdminWalletCreator } from '@/hooks/use-admin-wallet-creator'
import Link from 'next/link'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import ConnectedWalletCreatorCard from './connected-wallet-creator-card'

export default function AdminPage() {
  const wallet = useWallet()
  const { marketCreatorStatus, client, isInitialized } = useShortx()
  const { creator: adminWalletCreator, isChecking: isCheckingWallet } = useAdminWalletCreator(client, isInitialized)
  
  const handleMarketCreatorCreated = (pda: string) => {
    window.location.reload()
  }

  if (marketCreatorStatus.isChecking || isCheckingWallet) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-purple-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Checking market creator status...</p>
        </div>
      </div>
    )
  }

  const renderContent = () => {
    const hasEnvKey = marketCreatorStatus.hasEnvKey
    const isWalletConnected = wallet.publicKey !== null
    const connectedWalletIsAuthority = adminWalletCreator !== null
    const envMarketCreatorExists = marketCreatorStatus.exists && hasEnvKey

    // Case 1: Env present + connected wallet is NOT authority of that creator
    if (hasEnvKey && !connectedWalletIsAuthority && envMarketCreatorExists && isWalletConnected) {
      return (
        <div className="p-8 rounded-2xl bg-gradient-to-br from-red-500/10 to-orange-500/10 border border-red-500/20">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-red-500/20">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-2 text-red-400">Unauthorized Access</h2>
              <p className="text-slate-300 mb-4">
                The environment variable <code className="text-purple-400">NEXT_PUBLIC_CREATOR_PUBLIC_ADMIN_KEY</code> points to a market creator that you are not the authority of.
              </p>
              <p className="text-slate-400 text-sm mb-4">
                Please connect the wallet that is the authority of that market creator, or update your environment variables.
              </p>
              <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                <p className="text-sm text-slate-400">Current admin key:</p>
                <code className="text-xs text-slate-300">{marketCreatorStatus.pda}</code>
              </div>
            </div>
          </div>
        </div>
      )
    }

    // Case 2: No env + connected wallet IS authority of a creator
    if (!hasEnvKey && connectedWalletIsAuthority && adminWalletCreator) {
      return (
        <>
          <ConnectedWalletCreatorCard marketCreator={adminWalletCreator} />
          <div className="p-6 rounded-2xl bg-blue-500/10 border border-blue-500/20">
            <p className="text-blue-300">
              ⚠️ Please add the environment variables above to your `.env.local` file and restart the dev server.
            </p>
          </div>
        </>
      )
    }

    // Case 3: Env present + connected wallet IS authority
    if (hasEnvKey && connectedWalletIsAuthority && marketCreatorStatus.exists) {
      return <MarketCreatorDashboard marketCreatorPda={marketCreatorStatus.pda!} />
    }

    // Case 4: No env + no wallet connected
    if (!hasEnvKey && !isWalletConnected) {
      return (
        <div className="p-8 rounded-2xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-purple-500/20">
              <Wallet className="w-8 h-8 text-purple-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
              <p className="text-slate-300 mb-4">
                Please connect a wallet that is the authority of a market creator to access the admin dashboard.
              </p>
              <div className="inline-block">
                <WalletMultiButton />
              </div>
            </div>
          </div>
        </div>
      )
    }

    // Case 5: No env + wallet connected but NO creator found
    if (!hasEnvKey && isWalletConnected && !connectedWalletIsAuthority) {
      return (
        <>
          <div className="mb-4 p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50">
            <p className="text-slate-300 mb-2">
              No market creator found for your connected wallet.
            </p>
          </div>
          <CreateMarketCreatorFlow onCreated={handleMarketCreatorCreated} />
        </>
      )
    }

    // Default: Show create flow
    return <CreateMarketCreatorFlow onCreated={handleMarketCreatorCreated} />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <div className="mb-6">
          <Link 
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800 hover:border-slate-600 transition-all text-slate-300 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Admin Dashboard</h1>
          <p className="text-slate-400">
            Manage your prediction markets
          </p>
        </div>

        {renderContent()}
      </div>
    </div>
  )
}