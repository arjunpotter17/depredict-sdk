'use client'

import React from 'react'
import { Market, MarketType, WinningDirection } from '@endcorp/depredict'
import { Clock, Radio, PlayCircle, Gavel, CheckCircle, XCircle, MinusCircle, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface MarketCardProps {
  market: Market
  onClick?: () => void
}

export function MarketCard({ market, onClick }: MarketCardProps) {
  // Calculate percentage for yes votes
  const yesLiquidity = parseFloat(market.yesLiquidity || '0')
  const noLiquidity = parseFloat(market.noLiquidity || '0')
  const totalLiquidity = yesLiquidity + noLiquidity

  // Calculate probability (ratio doesn't need conversion)
  let probability = 0.5
  if (totalLiquidity > 0) {
    probability = yesLiquidity / totalLiquidity
  }
  const yesPercentage = Math.round(probability * 100)
  const noPercentage = 100 - yesPercentage

  // Format volume in USDC (convert from base units)
  const volume = parseFloat(market.volume || '0') / 1e6
  const formattedVolume = volume.toFixed(2)

  // Determine if this is a live market
  const isLive = market.marketType === MarketType.LIVE

  // Check if market is resolved
  const isResolved = market.winningDirection !== WinningDirection.NONE

  // Get market status and styling
  const getMarketStatus = () => {
    if (isResolved) {
      // Return the winning direction
      if (market.winningDirection === WinningDirection.YES) {
        return {
          text: 'RESOLVED: YES',
          color: 'text-emerald-400',
          bgColor: 'bg-emerald-500/10',
          borderColor: 'border-emerald-500/20',
          icon: CheckCircle,
          barColor: 'from-emerald-500 to-green-500',
        }
      } else if (market.winningDirection === WinningDirection.NO) {
        return {
          text: 'RESOLVED: NO',
          color: 'text-red-400', // Changed from slate to red
          bgColor: 'bg-red-500/10', // Changed from slate to red
          borderColor: 'border-red-500/20',
          icon: XCircle,
          barColor: 'from-slate-500 to-slate-600',
        }
      } else {
        return {
          text: 'RESOLVED',
          color: 'text-emerald-400',
          bgColor: 'bg-emerald-500/10',
          borderColor: 'border-emerald-500/20',
          icon: CheckCircle,
          barColor: 'from-emerald-500 to-green-500',
        }
      }
    } else {
      const now = Date.now()
      const marketStart = parseInt(market.marketStart) * 1000
      const marketEnd = parseInt(market.marketEnd) * 1000

      if (isLive) {
        // Live market - betting happens during market interval
        return {
          text: 'LIVE NOW',
          color: 'text-red-400',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/20',
          icon: Radio,
          barColor: 'from-red-500 to-red-600',
        }
      } else {
        // Future market
        if (now >= marketStart && now <= marketEnd) {
          // Market is currently running (active/observing)
          return {
            text: 'IN PLAY',
            color: 'text-orange-400',
            bgColor: 'bg-orange-500/10',
            borderColor: 'border-orange-500/20',
            icon: PlayCircle,
            barColor: 'from-orange-500 to-orange-600',
          }
        } else if (now < marketStart) {
          // Betting period (predicting)
          return {
            text: 'OPEN',
            color: 'text-emerald-400',
            bgColor: 'bg-emerald-500/10',
            borderColor: 'border-emerald-500/20',
            icon: Trophy,
            barColor: 'from-emerald-500 to-green-500',
          }
        } else {
          // Market has ended but not resolved
          return {
            text: 'ENDED',
            color: 'text-blue-400',
            bgColor: 'bg-blue-500/10',
            borderColor: 'border-blue-500/20',
            icon: Clock,
            barColor: 'from-blue-500 to-blue-600',
          }
        }
      }
    }
  }

  const status = getMarketStatus()
  const StatusIcon = status.icon

  // Time helper functions
  const getTimeLeft = (endTimestamp: string) => {
    const now = Date.now()
    const end = parseInt(endTimestamp) * 1000
    const diff = end - now
    if (diff <= 0) return 'match ended'
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    if (hours > 0) return `${hours}h ${minutes}m left`
    if (minutes > 0) return `${minutes}m left`
    return 'ending soon'
  }

  const getBettingTimeLeft = (startTimestamp: string) => {
    const now = Date.now()
    const start = parseInt(startTimestamp) * 1000
    const diff = start - now
    if (diff <= 0) return 'betting closed'
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    if (hours > 0) return `bet closes in ${hours}h ${minutes}m`
    if (minutes > 0) return `bet closes in ${minutes}m`
    return 'closing soon'
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(parseInt(timestamp) * 1000)
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  }

  const formatDate = (timestamp: string) => {
    const date = new Date(parseInt(timestamp) * 1000)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <Link href={`/market/${market.marketId}`}>
      <div
        onClick={onClick}
        className={cn(
          'group relative rounded-xl bg-slate-900/70 border border-slate-700/50 p-6 space-y-4 transition-all duration-300',
          'hover:border-emerald-500/50 hover:bg-slate-800/70 hover:shadow-lg hover:shadow-emerald-500/10',
          onClick && 'cursor-pointer hover:scale-[1.02]',
        )}
      >
        {/* Header with status badge and volume */}
        <div className="flex items-center justify-between">
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full border',
              status.bgColor,
              status.borderColor,
            )}
          >
            <StatusIcon className={cn('w-4 h-4', status.color)} />
            <span className={cn('text-xs font-bold uppercase tracking-wide', status.color)}>{status.text}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-xs font-semibold">Vol:</span>
            <span className="text-white text-base font-bold">${formattedVolume}</span>
          </div>
        </div>

        {/* Question */}
        <h3 className="font-bold text-lg leading-tight line-clamp-3 min-h-[4.5rem] group-hover:text-emerald-400 transition-colors">
          {market.question || `Market #${market.marketId}`}
        </h3>

        {/* Time Range */}
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Clock className="w-4 h-4 text-emerald-400/70" />
          <span>
            {formatTime(market.marketStart)} - {formatTime(market.marketEnd)}
          </span>
        </div>

        {/* Probability Section */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-slate-300 text-sm font-semibold">Odds</span>
            <span className="text-white text-xl font-bold">
              {noPercentage}% / {yesPercentage}%
            </span>
          </div>
          <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={cn('h-full bg-gradient-to-r transition-all duration-500', status.barColor)}
              style={{ width: `${yesPercentage}%` }}
            />
          </div>
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-slate-400">NO</span>
            <span className="text-emerald-400">YES</span>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5 text-emerald-400/70" />
            <span className="font-medium">
              {isLive ? getTimeLeft(market.marketEnd) : getBettingTimeLeft(market.marketStart)}
            </span>
          </div>
          <span className="text-xs text-slate-500 font-medium">{formatDate(market.marketStart)}</span>
        </div>

       
      </div>
    </Link>
  )
}
