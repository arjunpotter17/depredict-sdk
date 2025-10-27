'use client'

import React, { useMemo } from 'react'
import { useShortx } from '@/components/solana/useDepredict'
import { MarketStates } from '@endcorp/depredict'
import { TrendingUp, Activity, CheckCircle, DollarSign } from 'lucide-react'

interface MarketCreatorStatsProps {
  marketCreatorPda: string
}

export function MarketCreatorStats({ marketCreatorPda }: MarketCreatorStatsProps) {
  const { markets, loadingMarkets } = useShortx()

  // Add debug logging
  console.log('Markets in stats:', markets.length, markets)
  console.log('Market creator PDA:', marketCreatorPda)

  const stats = useMemo(() => {
    const now = Math.floor(Date.now() / 1000) // Current time in seconds
    
    const activeMarkets = markets.filter(m => {
      const state = m.marketState?.toString().toLowerCase()
      const isActive = state?.includes('active') || state?.includes('trading')
      
      // Only count as active if betting window is still open
      const bettingStart = m.bettingStartTime ? Number(m.bettingStartTime) : 0
      const marketStart = Number(m.marketStart)
      const isBettingOpen = now >= bettingStart && now < marketStart
      
      return isActive && isBettingOpen
    })
    
    const needsResolution = markets.filter(m => {
      const state = m.marketState?.toString().toLowerCase()
      const isNotResolved = !state?.includes('resolved')
      const marketEnd = Number(m.marketEnd)
      const isPastEndTime = marketEnd > 0 && now >= marketEnd
      
      return isNotResolved && isPastEndTime
    })
    
    const resolvedMarkets = markets.filter(m => 
      m.marketState === MarketStates.RESOLVED ||
      m.marketState?.toString().toLowerCase().includes('resolved')
    )
    
    const totalVolume = markets.reduce((sum, m) => sum + (Number(m.volume) / 1e6), 0)
    
    return {
      total: markets.length,
      active: activeMarkets.length,
      resolving: needsResolution.length,
      resolved: resolvedMarkets.length,
      volume: totalVolume,
    }
  }, [markets])

  if (loadingMarkets) {
    return (
      <div className="p-12 text-center text-slate-400">
        Loading market statistics...
      </div>
    )
  }

  // Add message if no markets found
  if (markets.length === 0) {
    return (
      <div className="space-y-6">
        <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center">
          <p className="text-slate-400 mb-2">No markets found</p>
          <p className="text-sm text-slate-500">
            Create your first market using the `&apos;`Create Market`&apos;` tab above
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Activity className="w-5 h-5 text-purple-400" />
            </div>
            <span className="text-sm text-slate-400">Total Markets</span>
          </div>
          <p className="text-3xl font-bold">{stats.total}</p>
        </div>

        <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-green-500/20">
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
            <span className="text-sm text-slate-400">Active Markets</span>
          </div>
          <p className="text-3xl font-bold text-green-400">{stats.active}</p>
        </div>

        <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-yellow-500/20">
              <Activity className="w-5 h-5 text-yellow-400" />
            </div>
            <span className="text-sm text-slate-400">Needs Resolution</span>
          </div>
          <p className="text-3xl font-bold text-yellow-400">{stats.resolving}</p>
        </div>

        <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <DollarSign className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-sm text-slate-400">Total Volume</span>
          </div>
          <p className="text-3xl font-bold text-blue-400">
            ${stats.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
        <h3 className="text-xl font-bold mb-4">Quick Actions</h3>
        <p className="text-slate-400 text-sm">
          Use the tabs above to create new markets or resolve existing ones.
        </p>
      </div>
    </div>
  )
}