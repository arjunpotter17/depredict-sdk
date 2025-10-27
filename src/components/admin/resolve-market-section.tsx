'use client'

import React, { useState, useMemo } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useShortx } from '@/components/solana/useDepredict'
import { toast } from 'sonner'
import { Loader2, Search, CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react'
import { MarketStates } from '@endcorp/depredict'

type WinningDirection = 'yes' | 'no' | 'draw' | 'none'

export function ResolveMarketSection() {
  const wallet = useWallet()
  const { connection } = useConnection()
  const { markets, resolveMarket } = useShortx()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMarket, setSelectedMarket] = useState<number | null>(null)
  const [winningDirection, setWinningDirection] = useState<WinningDirection>('yes')
  const [isResolving, setIsResolving] = useState(false)

  // Filter markets that can be resolved (past end time and not already resolved)
  const resolvableMarkets = useMemo(() => {
    const now = Math.floor(Date.now() / 1000) // Current time in seconds

    let filtered = markets.filter(market => {
      const state = market.marketState?.toString().toLowerCase()
      const isNotResolved = !state?.includes('resolved')
      const marketEnd = Number(market.marketEnd)
      const isPastEndTime = marketEnd > 0 && now >= marketEnd

      return isNotResolved && isPastEndTime
    })

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(market => {
        // Decode question if it's a buffer
        let question = ''
        try {
          if (Array.isArray(market.question)) {
            question = Buffer.from(market.question).toString('utf8').replace(/\0/g, '').trim().toLowerCase()
          } else {
            question = market.question?.toString().toLowerCase() || ''
          }
        } catch {
          question = market.question?.toString().toLowerCase() || ''
        }
        
        return question.includes(query) || market.marketId?.toString().includes(query)
      })
    }

    // Sort by end time (most recently ended first)
    return filtered.sort((a, b) => Number(b.marketEnd) - Number(a.marketEnd))
  }, [markets, searchQuery])

  const handleResolveMarket = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      toast.error('Please connect your wallet')
      return
    }

    if (selectedMarket === null) {
      toast.error('Please select a market to resolve')
      return
    }

    setIsResolving(true)

    try {
      toast.loading('Preparing market resolution...', { id: 'resolve-market' })



      const resolveArgs = {
        marketId: selectedMarket,
        resolutionValue: (winningDirection === 'yes' ? 10 : 11) as 10 | 11,
        payer: wallet.publicKey,
      }

      console.log('Resolving market with args:', resolveArgs)

      const tx = await resolveMarket(resolveArgs)

      if (!tx) {
        throw new Error('Failed to create resolution transaction')
      }

      toast.loading('Waiting for signature...', { id: 'resolve-market' })

      // Get the latest blockhash for transaction confirmation
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

      // Update transaction blockhash
      tx.message.recentBlockhash = blockhash

      // Sign the transaction
      const signedTx = await wallet.signTransaction(tx)

      toast.loading('Sending transaction...', { id: 'resolve-market' })

      // Send the signed transaction
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })

      console.log('Resolution transaction signature:', signature)

      toast.loading('Confirming transaction...', { id: 'resolve-market' })

      // Confirm the transaction
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        'confirmed'
      )

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
      }

      console.log('Market resolved successfully!')

      toast.success(
        `Market #${selectedMarket} resolved as ${winningDirection.toUpperCase()}!`,
        { 
          id: 'resolve-market',
          duration: 5000,
        }
      )

      // Reset selection
      setSelectedMarket(null)
      setWinningDirection('yes')

    } catch (error: any) {
      console.error('Resolve market error:', error)
      
      const errorMsg = error?.message || String(error)
      const errorLower = errorMsg.toLowerCase()

      if (errorLower.includes('user rejected') || errorLower.includes('user denied')) {
        toast.error('Transaction rejected', { id: 'resolve-market' })
      } else if (errorLower.includes('insufficient funds')) {
        toast.error('Insufficient funds to resolve market', { id: 'resolve-market' })
      } else if (errorLower.includes('blockhash not found')) {
        toast.error('Transaction expired, please try again', { id: 'resolve-market' })
      } else {
        toast.error(`Failed: ${errorMsg.slice(0, 100)}`, { id: 'resolve-market' })
      }
    } finally {
      setIsResolving(false)
    }
  }

  const getMarketQuestion = (market: any) => {
    try {
      if (Array.isArray(market.question)) {
        return Buffer.from(market.question).toString('utf8').replace(/\0/g, '').trim()
      }
      return market.question?.toString().trim() || 'Untitled Market'
    } catch {
      return 'Untitled Market'
    }
  }

  const formatDate = (timestamp: string | number) => {
    const ts = Number(timestamp)
    if (!ts || ts === 0) return 'TBD'
    return new Date(ts * 1000).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getTimeSinceEnd = (endTimestamp: string | number) => {
    const end = Number(endTimestamp) * 1000
    const now = Date.now()
    const diff = now - end

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
    return 'Just ended'
  }

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50">
        <h2 className="text-2xl font-bold mb-4">Resolve Markets</h2>
        <p className="text-slate-400 mb-6">
          Select a market that has ended and set the winning outcome.
        </p>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search markets by question or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all"
          />
        </div>

        {/* Markets List */}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {resolvableMarkets.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-slate-500 mx-auto mb-3" />
              <p className="text-slate-400 mb-1">
                {searchQuery ? 'No markets found matching your search' : 'No markets ready for resolution'}
              </p>
              <p className="text-xs text-slate-500">
                Markets can be resolved after their end time has passed
              </p>
            </div>
          ) : (
            resolvableMarkets.map((market) => (
              <button
                key={market.marketId}
                onClick={() => setSelectedMarket(Number(market.marketId))}
                className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                  selectedMarket === Number(market.marketId)
                    ? 'bg-purple-500/20 border-purple-500'
                    : 'bg-slate-900/50 border-slate-700/50 hover:border-slate-600'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-1 rounded bg-slate-700/50 text-xs font-medium">
                        Market #{market.marketId}
                      </span>
                      <span className="px-2 py-1 rounded bg-red-500/20 text-red-400 text-xs font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {getTimeSinceEnd(market.marketEnd)}
                      </span>
                    </div>
                    <p className="font-medium text-white mb-1 line-clamp-2">
                      {getMarketQuestion(market)}
                    </p>
                    <p className="text-sm text-slate-400">
                      Ended: {formatDate(market.marketEnd)}
                    </p>
                  </div>
                  {selectedMarket === Number(market.marketId) && (
                    <CheckCircle className="w-6 h-6 text-purple-400 flex-shrink-0" />
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Resolution Options */}
      {selectedMarket !== null && (
        <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50">
          <h3 className="text-xl font-bold mb-4">Select Winning Outcome</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <button
              onClick={() => setWinningDirection('yes')}
              className={`p-4 rounded-xl border-2 transition-all ${
                winningDirection === 'yes'
                  ? 'bg-green-500/20 border-green-500'
                  : 'bg-slate-900/50 border-slate-700/50 hover:border-slate-600'
              }`}
            >
              <CheckCircle className={`w-6 h-6 mx-auto mb-2 ${
                winningDirection === 'yes' ? 'text-green-400' : 'text-slate-500'
              }`} />
              <p className="font-semibold text-center">YES</p>
            </button>

            <button
              onClick={() => setWinningDirection('no')}
              className={`p-4 rounded-xl border-2 transition-all ${
                winningDirection === 'no'
                  ? 'bg-red-500/20 border-red-500'
                  : 'bg-slate-900/50 border-slate-700/50 hover:border-slate-600'
              }`}
            >
              <XCircle className={`w-6 h-6 mx-auto mb-2 ${
                winningDirection === 'no' ? 'text-red-400' : 'text-slate-500'
              }`} />
              <p className="font-semibold text-center">NO</p>
            </button>           
          </div>

          <button
            onClick={handleResolveMarket}
            disabled={!wallet.publicKey || isResolving}
            className="w-full py-4 rounded-xl font-semibold transition-all bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isResolving ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Resolving Market...
              </span>
            ) : !wallet.publicKey ? (
              'Connect Wallet to Resolve'
            ) : (
              `Resolve Market #${selectedMarket} as ${winningDirection.toUpperCase()}`
            )}
          </button>
        </div>
      )}

      {/* Warning Box */}
      <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-400 mb-1">Important</h3>
            <p className="text-xs text-slate-400">
              Market resolution is permanent and cannot be undone. Make sure you select the correct winning outcome before confirming.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}