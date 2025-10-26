'use client'

import React, { useState } from 'react'
import { PositionCard } from './position-card'
import { Filter, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePositionDetails } from '@/hooks/use-position-details'
import { PublicKey } from '@solana/web3.js'
import { useShortx } from '@/components/solana/useDepredict'
import { useSolana } from '@/components/solana/use-solana'
import { useBurnNft } from '@/hooks/use-burn-nft'
import { toast } from 'sonner'
import { useClaimAndBurn } from '@/hooks/use-claim-and-burn'

type FilterType = 'all' | 'active' | 'won' | 'lost'

export function PositionsList() {
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  
  // Use the hook to get real position data
  const { positions, loading, error, removePositionOptimistic } = usePositionDetails()
  const { account } = useSolana()
  const { burnNft } = useBurnNft()
  const { claimAndBurn } = useClaimAndBurn()

  // Replace handleClaim to use atomic claim+burn
  const handleClaim = async (assetId: string, marketId: number) => {
    try {
      await claimAndBurn(assetId, marketId)
      removePositionOptimistic(assetId)
    } catch (err) {
      console.error('Claim error:', err)
      // Error is already handled in the hook with toast
    }
  }

  // handleBurn stays the same for lost positions
  const handleBurn = async (assetId: string) => {
    if (!account) {
      toast.error('Wallet not connected')
      return
    }

    try {
      // Use the burn hook
      await burnNft(assetId, process.env.NEXT_PUBLIC_CORE_COLLECTION_ID)
      removePositionOptimistic(assetId)
    } catch (err) {
      // Error is already handled in the hook with toast
      console.error('Burn error:', err)
    }
  }

  // Filter positions based on active filter
  const filteredPositions = positions.filter(pos => 
    activeFilter === 'all' || pos.status === activeFilter
  )

  // Calculate filter counts
  const filters: { value: FilterType; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: positions.length },
    { value: 'active', label: 'Active', count: positions.filter(p => p.status === 'active').length },
    { value: 'won', label: 'Won', count: positions.filter(p => p.status === 'won').length },
    { value: 'lost', label: 'Lost', count: positions.filter(p => p.status === 'lost').length },
  ]

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
        <p className="text-sm text-slate-400">Loading your positions...</p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 text-sm">Failed to load positions</p>
        <p className="text-slate-500 text-xs mt-1">{error.message}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Filter className="w-4 h-4" />
          <span className="hidden sm:inline">Filter:</span>
        </div>
        {filters.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setActiveFilter(filter.value)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-300',
              activeFilter === filter.value
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/25'
                : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-purple-500/50 hover:text-white'
            )}
          >
            {filter.label}
            <span className={cn(
              'ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-semibold',
              activeFilter === filter.value ? 'bg-white/20' : 'bg-slate-700/50'
            )}>
              {filter.count}
            </span>
          </button>
        ))}
      </div>

      {/* Positions List */}
      <div className="space-y-3">
        {filteredPositions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-400">No positions found</p>
            <p className="text-slate-500 text-sm mt-1">
              {positions.length === 0 
                ? 'Start predicting to see your positions here'
                : 'Try adjusting your filters'
              }
            </p>
          </div>
        ) : (
          filteredPositions.map((position) => (
            <PositionCard 
              key={position.id} 
              position={{
                id: position.id,
                assetId: position.assetId,
                marketId: position.marketId,
                question: position.question || `Market #${position.marketId}`,
                direction: position.direction,
                amount: position.amount,
                probability: position.probability || 50,
                status: position.status,
                timestamp: new Date(position.timestamp).toLocaleDateString(),
              }}
              onClaim={handleClaim}
              onBurn={handleBurn}
            />
          ))
        )}
      </div>
    </div>
  )
}