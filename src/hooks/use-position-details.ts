'use client'

import { useState, useEffect } from 'react'
import { useShortx } from '@/components/solana/useDepredict'
import { PublicKey } from '@solana/web3.js'
import { useUserPositions } from './use-user-positions'
import { MarketStates, WinningDirection } from '@endcorp/depredict'

export interface UsePositionDetailsReturn {
    positions: PositionDetail[]
    loading: boolean
    error: Error | null
    refetch: () => Promise<void>
    removePositionOptimistic: (assetId: string) => void
  }

interface PositionDetail {
  id: string
  assetId: string
  marketId: number
  positionId: number
  amount: number // in USDC (already converted from base units)
  direction: 'yes' | 'no'
  status: 'active' | 'won' | 'lost' | 'pending'
  question?: string
  probability?: number
  timestamp: string
}

export function usePositionDetails() {
  const { client, markets } = useShortx()
  const { parsedAssets, loading: assetsLoading } = useUserPositions()
  const [positions, setPositions] = useState<PositionDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const removePositionOptimistic = (assetId: string) => {
    setPositions((prev) => prev.filter((pos) => pos.assetId !== assetId))
  }

  const fetchPositionDetails = async () => {
    if (!client || parsedAssets.length === 0) {
      setPositions([])
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Fetch position details for each parsed asset
      const positionPromises = parsedAssets.map(async (parsedAsset) => {
        try {
          const assetPubkey = new PublicKey(parsedAsset.assetId)

          // Use SDK to get position account by assetId and marketId
          // Assuming the SDK has a method like: client.position.getPositionByAsset(marketId, assetId)
          const positionAccount = await client.position.getAccountByAssetAndMarket(parsedAsset.marketId, assetPubkey)

          if (!positionAccount) {
            console.warn(`No position found for asset ${parsedAsset.assetId}`)
            return null
          }

          const position = positionAccount.entry

          // Find the corresponding market for this position
          const market = markets.find((m) => m.marketId === parsedAsset.marketId.toString())

          // Parse direction from position account
          // Assuming positionAccount has a direction field that's either { yes: {} } or { no: {} }
          let direction: 'yes' | 'no' = 'yes'
          if (position.direction) {
            if ('yes' in position.direction) {
              direction = 'yes'
            } else if ('no' in position.direction) {
              direction = 'no'
            }
          }

          // Convert amount from base units (assuming 6 decimals for USDC)
          const amount = parseFloat(position.amount?.toString() || '0') / 1e6

          // Determine status based on market state and winning direction
          let status: 'active' | 'won' | 'lost' | 'pending' = 'active'
          if (market) {
            if (market.marketState === MarketStates.RESOLVED) {
              // Check if user won or lost
              status = market.winningDirection === WinningDirection.YES ? 'won' : 'lost'
            } else if (market.marketState === MarketStates.ACTIVE) {
              status = 'active'
            } else {
              status = 'pending'
            }
          }

          // Calculate probability for the position
          const yesLiq = parseFloat(market?.yesLiquidity || '0')
          const noLiq = parseFloat(market?.noLiquidity || '0')
          const total = yesLiq + noLiq
          const probability = total > 0 ? Math.round((yesLiq / total) * 100) : 50

          const removePositionOptimistic = (assetId: string) => {
            setPositions((prev) => prev.filter((pos) => pos.assetId !== assetId))
          }
          
          return {
            id: parsedAsset.assetId,
            assetId: parsedAsset.assetId,
            marketId: parsedAsset.marketId,
            positionId: parsedAsset.positionId,
            amount,
            direction,
            status,
            question: market?.question || `Market #${parsedAsset.marketId}`,
            probability,
            timestamp: new Date().toISOString(), // You can get this from positionAccount if available
          } as PositionDetail
        } catch (err) {
          console.error(`Failed to fetch position for asset ${parsedAsset.assetId}:`, err)
          return null
        }
      })

      const positionDetails = (await Promise.all(positionPromises)).filter((pos): pos is PositionDetail => pos !== null)

      setPositions(positionDetails)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error fetching position details')
      setError(error)
      console.error('Error fetching position details:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!assetsLoading && parsedAssets.length > 0 && markets.length > 0) {
      fetchPositionDetails()
    } else if (parsedAssets.length === 0) {
      setPositions([])
    }
  }, [parsedAssets, assetsLoading, client, markets])

  return {
    positions,
    loading: loading || assetsLoading,
    error,
    refetch: fetchPositionDetails,
    removePositionOptimistic,
  }
}
