'use client'

import React, { useState } from 'react'
import { Clock, TrendingUp, CheckCircle, XCircle, Flame, Trophy, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Position {
  id: string
  assetId?: string
  marketId?: number
  question: string
  direction: 'yes' | 'no'
  amount: number
  probability: number
  status: 'active' | 'won' | 'lost' | 'pending'
  resolvedDirection?: 'yes' | 'no' | 'draw' | 'none' | null // Add this
  timestamp: string
}

interface PositionCardProps {
  position: Position
  onClaim?: (assetId: string, marketId: number) => Promise<void>
  onBurn?: (assetId: string) => Promise<void>
}

export function PositionCard({ position, onClaim, onBurn }: PositionCardProps) {
  const [isProcessing, setIsProcessing] = useState(false)

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'won':
        return {
          label: 'Won',
          color: 'text-emerald-400',
          bgColor: 'bg-emerald-500/10',
          borderColor: 'border-emerald-500/20',
          icon: CheckCircle,
        }
      case 'lost':
        return {
          label: 'Lost',
          color: 'text-red-400',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/20',
          icon: XCircle,
        }
      case 'active':
        return {
          label: 'Active',
          color: 'text-blue-400',
          bgColor: 'bg-blue-500/10',
          borderColor: 'border-blue-500/20',
          icon: TrendingUp,
        }
      default:
        return {
          label: 'Pending',
          color: 'text-slate-400',
          bgColor: 'bg-slate-500/10',
          borderColor: 'border-slate-500/20',
          icon: Clock,
        }
    }
  }

  const statusConfig = getStatusConfig(position.status)
  const StatusIcon = statusConfig.icon

  const handleClaim = async () => {
    if (!position.assetId || !position.marketId || !onClaim) return

    setIsProcessing(true)
    try {
      await onClaim(position.assetId, position.marketId)
    } catch (error) {
      console.error('Failed to claim:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleBurn = async () => {
    if (!position.assetId || !onBurn) return

    setIsProcessing(true)
    try {
      await onBurn(position.assetId)
    } catch (error) {
      console.error('Failed to burn:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="group p-4 rounded-xl bg-slate-800/30 border border-slate-700/50 hover:border-purple-500/50 transition-all duration-300">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-white line-clamp-2 flex-1 group-hover:text-purple-400 transition-colors">
            {position.question}
          </p>
          <div
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-semibold whitespace-nowrap',
              statusConfig.bgColor,
              statusConfig.borderColor,
              statusConfig.color,
            )}
          >
            <StatusIcon className="w-3 h-3" />
            {statusConfig.label}
          </div>
        </div>

        {/* Bet Direction */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Your bet:</span>
          <span
            className={cn(
              'px-2 py-0.5 rounded text-xs font-bold',
              position.direction === 'yes'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30',
            )}
          >
            {position.direction.toUpperCase()}
          </span>
        </div>

        {/* Market Resolved Direction - Show only if market is resolved */}
        {position.resolvedDirection && (position.status === 'won' || position.status === 'lost') && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Market resolved:</span>
            <span
              className={cn(
                'px-2 py-0.5 rounded text-xs font-bold',
                position.resolvedDirection === 'yes'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : position.resolvedDirection === 'no'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
              )}
            >
              {position.resolvedDirection === 'draw' ? 'DRAW' : position.resolvedDirection.toUpperCase()}
            </span>
          </div>
        )}

        {/* Stats Row */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-slate-400">Amount: </span>
              <span className="text-white font-semibold">${position.amount.toFixed(2)}</span>
            </div>
           
          </div>
          <span className="text-slate-500">{position.timestamp}</span>
        </div>

        {/* Action Buttons */}
        {position.status === 'won' && onClaim && (
          <button
            onClick={handleClaim}
            disabled={isProcessing}
            className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg shadow-emerald-500/25"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Trophy className="w-4 h-4" />
                Claim Winnings
              </>
            )}
          </button>
        )}

        {position.status === 'lost' && onBurn && (
          <button
            onClick={handleBurn}
            disabled={isProcessing}
            className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 text-red-400 hover:text-red-300 font-semibold transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Flame className="w-4 h-4" />
                Burn NFT
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
