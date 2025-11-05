'use client'

import React, { useState, useEffect } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  Info,
  ArrowLeft,
  Sparkles,
  Activity,
  CheckCircle,
  Trophy,
} from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useShortx } from '@/components/solana/useDepredict'
import { Market, WinningDirection } from '@endcorp/depredict'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { Transaction, VersionedTransaction, PublicKey } from '@solana/web3.js'
import { toast } from 'sonner'
import { useSolana } from '../solana/use-solana'

export default function MarketDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const marketId = params?.marketId ? Number(params.marketId) : null
  const wallet = useWallet()
  const { connection } = useConnection()
  const { account } = useSolana()
  const { getAllPositionPagesForMarket, isInitialized, markets, client, openPosition, updateMarketOptimistic } =
    useShortx()

  console.log('account', account)
  console.log('wallet', wallet)

  const [selectedOutcome, setSelectedOutcome] = useState<'yes' | 'no'>('yes')
  const [betAmount, setBetAmount] = useState('')
  const [isPlacingBet, setIsPlacingBet] = useState(false)
  const [totalBets, setTotalBets] = useState<number>(0)
  const [loadingBets, setLoadingBets] = useState(true)
  const [market, setMarket] = useState<Market | null>(null)
  const [loadingMarket, setLoadingMarket] = useState(true)

  console.log('market', market)

  // Format bet amount input to max 2 decimal places
  const handleBetAmountChange = (value: string) => {
    // Allow empty string
    if (value === '') {
      setBetAmount('')
      return
    }

    // Remove any non-numeric characters except decimal point
    const cleaned = value.replace(/[^\d.]/g, '')

    // Ensure only one decimal point
    const parts = cleaned.split('.')
    if (parts.length > 2) {
      return
    }

    // Limit to 2 decimal places
    if (parts.length === 2 && parts[1].length > 2) {
      return
    }

    setBetAmount(cleaned)
  }

  // Fetch market data
  useEffect(() => {
    const fetchMarket = async () => {
      if (!marketId || !isInitialized || !client) return

      setLoadingMarket(true)
      try {
        // First try to find in markets array
        const foundMarket = markets.find((m) => Number(m.marketId) === marketId)
        if (foundMarket) {
          console.log('foundMarket', foundMarket)
          setMarket(foundMarket)
        } else {
          // Fetch from SDK if not in array
          const fetchedMarket = await client.trade.getMarketById(marketId)
          if (fetchedMarket) {
            setMarket(fetchedMarket)
          }
        }
      } catch (error) {
        console.error('Failed to fetch market:', error)
      } finally {
        setLoadingMarket(false)
      }
    }

    fetchMarket()
  }, [marketId, isInitialized, client])

  // Fetch total bets
  useEffect(() => {
    const fetchTotalBets = async () => {
      if (!marketId || !isInitialized) return

      setLoadingBets(true)
      try {
        const pages = await getAllPositionPagesForMarket(marketId)
        if (pages) {
          const total = pages.reduce((sum, page) => sum + page.usedSlots, 0)
          setTotalBets(total)
        }
      } catch (error) {
        console.error('Failed to fetch position pages:', error)
        setTotalBets(0)
      } finally {
        setLoadingBets(false)
      }
    }

    fetchTotalBets()
  }, [marketId, isInitialized])

  // Calculate probabilities and prices from liquidity
  const getMarketStats = () => {
    if (!market) return { yesProb: 0.5, noProb: 0.5, totalLiquidity: 0, volume: 0 }

    const yesLiq = Number(market.yesLiquidity) / 1e6
    const noLiq = Number(market.noLiquidity) / 1e6
    const totalLiq = yesLiq + noLiq

    const yesProb = totalLiq > 0 ? yesLiq / totalLiq : 0.5
    const noProb = totalLiq > 0 ? noLiq / totalLiq : 0.5
    const volume = Number(market.volume) / 1e6

    return { yesProb, noProb, totalLiquidity: totalLiq, volume }
  }

  const isResolved = () => {
    if (!market) return false
    const state = market.marketState?.toString().toLowerCase()
    return state?.includes('resolved')
  }

  const isBettingOpen = () => {
    if (!market) return false

    // Check if market is resolved
    if (isResolved()) return false

    // Get current time in seconds
    const now = Math.floor(Date.now() / 1000)

    // Get betting start and end times
    const bettingStart = market.bettingStartTime ? Number(market.bettingStartTime) : 0
    const marketStart = Number(market.marketStart)

    // Betting is open if current time is between betting start and market start
    return now >= bettingStart && now < marketStart
  }

  const isBettingNotStartedYet = () => {
    if (!market || isResolved()) return false

    const now = Math.floor(Date.now() / 1000)
    const bettingStart = market.bettingStartTime ? Number(market.bettingStartTime) : 0

    return now < bettingStart
  }

  const isBettingClosed = () => {
    if (!market || isResolved()) return false

    const now = Math.floor(Date.now() / 1000)
    const marketStart = Number(market.marketStart)

    return now >= marketStart
  }

  const getWinningDirection = () => {
    if (!market || !market.winningDirection) return null

    const direction = market.winningDirection.toString().toLowerCase()
    if (direction.includes('yes')) return 'YES'
    if (direction.includes('no')) return 'NO'
    if (direction.includes('draw')) return 'DRAW'
    return null
  }

  const stats = getMarketStats()

  // Update formatDate to include time
  const formatDate = (timestamp: string | number) => {
    const ts = Number(timestamp)
    if (!ts || ts === 0) return 'TBD'
    return new Date(ts * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusBadge = () => {
    if (!market) return null

    const state = market.marketState?.toString().toLowerCase()
    const now = Math.floor(Date.now() / 1000)
    const marketStart = Number(market.marketStart)
    const marketEnd = Number(market.marketEnd)

    if (state?.includes('resolved')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-medium">
          <CheckCircle className="w-4 h-4" />
          Settled
        </span>
      )
    }

    // Check if market has ended (for resolution)
    if (marketEnd > 0 && now >= marketEnd) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm font-medium">
          <Clock className="w-4 h-4" />
          Needs Resolution
        </span>
      )
    }

    // Check if betting window is open
    if (isBettingOpen()) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium">
          <Trophy className="w-4 h-4" />
          Open for Betting
        </span>
      )
    }

    // Market is active but betting window closed
    if (now >= marketStart && now < marketEnd) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium">
          <Clock className="w-4 h-4" />
          In Play
        </span>
      )
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-500/10 border border-slate-500/20 text-slate-400 text-sm font-medium">
        <Clock className="w-4 h-4" />
        Pending
      </span>
    )
  }

  const calculatePayout = () => {
    if (!betAmount || isNaN(parseFloat(betAmount)) || !market) return 0
    const amount = parseFloat(betAmount)
    const prob = selectedOutcome === 'yes' ? stats.yesProb : stats.noProb

    // In parimutuel: if you win, you get (your bet / total losing pool) * total winning pool
    // Simplified: potential return based on current odds
    if (prob > 0) {
      return amount / prob
    }
    return amount
  }

  const calculateProfit = () => {
    const payout = calculatePayout()
    const amount = parseFloat(betAmount) || 0
    return payout - amount
  }

  const handlePlaceBet = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      toast.error('Please connect your wallet first')
      return
    }

    if (!client || !market) {
      toast.error('Market not loaded')
      return
    }

    const amount = parseFloat(betAmount)
    if (!amount || amount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    setIsPlacingBet(true)

    try {
      toast.loading('Preparing transaction...', { id: 'place-bet' })

      const anchorDirection = selectedOutcome === 'yes' ? { yes: {} } : { no: {} }

      // Prepare openPosition arguments
      const openArgs = {
        marketId: Number(market.marketId),
        amount: amount,
        direction: anchorDirection,
        payer: wallet.publicKey,
        metadataUri: 'https://add-metadata-uri-here',
      }

      console.log('Opening position with args:', openArgs)

      // Call openPosition from SDK
      const result = await openPosition(openArgs)

      if (!result) {
        throw new Error('Failed to create position transaction')
      }

      toast.loading('Waiting for signature...', { id: 'place-bet' })

      // Handle different return types
      let signature: string

      if (typeof result === 'string') {
        // Already a signature (transaction was sent by SDK)
        signature = result
      } else if ('ixs' in result) {
        // Got instructions back, need to build and sign transaction
        const { ixs, addressLookupTableAccounts } = result

        // Get recent blockhash
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

        // Create transaction
        const transaction = new Transaction()
        transaction.add(...ixs)
        transaction.recentBlockhash = blockhash
        transaction.feePayer = wallet.publicKey

        toast.loading('Signing transaction...', { id: 'place-bet' })

        // Sign transaction
        const signedTx = await wallet.signTransaction(transaction)

        toast.loading('Sending transaction...', { id: 'place-bet' })

        // Send transaction
        signature = await connection.sendRawTransaction(signedTx.serialize())

        toast.loading('Confirming transaction...', { id: 'place-bet' })

        const { blockhash: newBlockhash, lastValidBlockHeight: newLastValidBlockHeight } = await connection.getLatestBlockhash()

        // Wait for confirmation
        await connection.confirmTransaction({
          signature,
          blockhash: newBlockhash,
          lastValidBlockHeight: newLastValidBlockHeight,
        })
      } else {
        throw new Error('Unexpected result format from openPosition')
      }

      console.log('Position opened successfully:', signature)

      toast.success('Bet placed successfully!', { id: 'place-bet' })

      // OPTIMISTIC UPDATES - Update UI immediately
      const amountInMicroUnits = amount * 1e6 // Convert to micro units

      // 1. Optimistically increment total bets
      setTotalBets((prev) => prev + 1)

      // 2. Optimistically update market liquidity and volume
      if (market) {
        const updatedYesLiquidity =
          selectedOutcome === 'yes'
            ? (Number(market.yesLiquidity) + amountInMicroUnits).toString()
            : market.yesLiquidity

        const updatedNoLiquidity =
          selectedOutcome === 'no' ? (Number(market.noLiquidity) + amountInMicroUnits).toString() : market.noLiquidity

        const updatedVolume = (Number(market.volume) + amountInMicroUnits).toString()

        const optimisticMarket = {
          ...market,
          yesLiquidity: updatedYesLiquidity,
          noLiquidity: updatedNoLiquidity,
          volume: updatedVolume,
        }

        // Update local market state
        setMarket(optimisticMarket)

        // Update global markets array in context
        updateMarketOptimistic(market.marketId, {
          yesLiquidity: updatedYesLiquidity,
          noLiquidity: updatedNoLiquidity,
          volume: updatedVolume,
        })
      }

      // Clear bet amount
      setBetAmount('')
    } catch (error: any) {
      console.error('Place bet error:', error)

      const errorMsg = error?.message || String(error)
      const errorLower = errorMsg.toLowerCase()

      if (errorLower.includes('user rejected') || errorLower.includes('user denied')) {
        toast.error('Transaction rejected', { id: 'place-bet' })
      } else if (errorLower.includes('insufficient funds')) {
        toast.error('Insufficient funds', { id: 'place-bet' })
      } else if (errorLower.includes('blockhash not found')) {
        toast.error('Transaction expired, please try again', { id: 'place-bet' })
      } else {
        toast.error(`Failed to place bet: ${errorMsg.slice(0, 100)}`, { id: 'place-bet' })
      }
    } finally {
      setIsPlacingBet(false)
    }
  }

  if (loadingMarket) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/20 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">Loading market...</p>
        </div>
      </div>
    )
  }

  if (!market) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/20 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-2">Market not found</p>
          <button
            onClick={() => router.back()}
            className="text-slate-400 hover:text-emerald-400 transition-colors font-semibold"
          >
            ← Go back
          </button>
        </div>
      </div>
    )
  }

  // Decode question from buffer if needed
  const getQuestion = () => {
    if (!market.question) return 'Untitled Market'

    try {
      if (Array.isArray(market.question)) {
        return Buffer.from(market.question).toString('utf8').replace(/\0/g, '').trim()
      }
      return market.question.toString().trim()
    } catch {
      return 'Untitled Market'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/20 text-white">
      {/* Header */}
      <header className="border-b border-emerald-900/20 backdrop-blur-sm sticky top-0 z-10 bg-slate-950/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-slate-400 hover:text-emerald-400 transition-colors group"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="font-semibold">Back to Markets</span>
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Market Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">{getStatusBadge()}</div>
              <h1 className="text-3xl md:text-4xl font-bold mb-3 bg-gradient-to-r from-white to-emerald-100 bg-clip-text text-transparent">
                {getQuestion()}
              </h1>
              <p className="text-slate-400 text-sm md:text-base leading-relaxed">
                Place your bet and win big! All bets are pooled together, and winnings are distributed proportionally
                among winners.
              </p>
            </div>
          </div>

          {/* Market Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/70 border border-emerald-900/20 hover:border-emerald-500/30 transition-colors">
              <div className="flex items-center gap-2 text-emerald-400/70 text-sm mb-1">
                <DollarSign className="w-4 h-4" />
                Total Volume
              </div>
              <div className="text-2xl font-bold text-white">
                ${stats.volume.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/70 border border-emerald-900/20 hover:border-emerald-500/30 transition-colors">
              <div className="flex items-center gap-2 text-emerald-400/70 text-sm mb-1">
                <Activity className="w-4 h-4" />
                Total Bets
              </div>
              <div className="text-2xl font-bold text-white">
                {loadingBets ? <span className="text-slate-500 text-lg">Loading...</span> : totalBets}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/70 border border-emerald-900/20 hover:border-emerald-500/30 transition-colors">
              <div className="flex items-center gap-2 text-emerald-400/70 text-sm mb-1">
                <Clock className="w-4 h-4" />
                {isResolved() ? 'Settled on' : 'Betting closes'}
              </div>
              <div className="text-xl font-bold text-white">
                {isResolved() ? formatDate(market.marketEnd) : formatDate(market.marketStart)}
              </div>
              {isResolved() && getWinningDirection() && (
                <div
                  className={`text-sm mt-1 font-semibold ${
                    getWinningDirection() === 'YES'
                      ? 'text-emerald-400'
                      : getWinningDirection() === 'NO'
                        ? 'text-red-400'
                        : 'text-yellow-400'
                  }`}
                >
                  Winner: {getWinningDirection()}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`grid ${
          isResolved() || !isBettingOpen() 
            ? 'lg:grid-cols-1' 
            : 'lg:grid-cols-3'
        } gap-6`}>
          {/* Left Column - Odds */}
          <div className={`${
            isResolved() || !isBettingOpen() 
              ? 'lg:col-span-1' 
              : 'lg:col-span-2'
          } space-y-6`}>
            {/* Current Odds */}
            <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50 backdrop-blur-sm">
              <h2 className="text-xl font-bold mb-6">Current Odds</h2>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-emerald-400">YES</span>
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="text-4xl font-bold text-emerald-400 mb-1">{(stats.yesProb * 100).toFixed(1)}%</div>
                  <div className="text-sm text-slate-400">
                    $
                    {stats.totalLiquidity > 0
                      ? (Number(market.yesLiquidity) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })
                      : '0'}{' '}
                    pool
                  </div>
                </div>

                <div className="p-6 rounded-xl bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-red-400">NO</span>
                    <TrendingDown className="w-5 h-5 text-red-400" />
                  </div>
                  <div className="text-4xl font-bold text-red-400 mb-1">{(stats.noProb * 100).toFixed(1)}%</div>
                  <div className="text-sm text-slate-400">
                    $
                    {stats.totalLiquidity > 0
                      ? (Number(market.noLiquidity) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })
                      : '0'}{' '}
                    pool
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-700/30">
                <div className="flex items-start gap-2 text-xs text-slate-400">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p>
                    Odds represent the current distribution of bets. Your potential payout depends on the final pool
                    sizes when the market closes.
                  </p>
                </div>
              </div>
            </div>

            {/* Market Info */}
            <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50 backdrop-blur-sm">
              <h2 className="text-xl font-bold mb-4">Market Information</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-slate-700/50">
                  <span className="text-slate-400">Betting Opens</span>
                  <span className="font-medium">{formatDate(market.bettingStartTime || market.marketStart)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-700/50">
                  <span className="text-slate-400">Betting Closes</span>
                  <span className="font-medium">{formatDate(market.marketStart)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-700/50">
                  <span className="text-slate-400">Market Ends</span>
                  <span className="font-medium">{formatDate(market.marketEnd)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">Total Pool</span>
                  <span className="font-medium">
                    ${stats.totalLiquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Betting Box */}
          {!isResolved() && isBettingOpen() && (
            <div className="lg:col-span-1">
              <div className="sticky top-24">
                <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50 backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-6">
                    <Sparkles className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-xl font-bold">Place Your Bet</h2>
                  </div>

                  {/* Outcome Selection */}
                  <div className="mb-6">
                    <label className="text-sm font-medium text-slate-300 mb-2 block">Select Outcome</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setSelectedOutcome('yes')}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          selectedOutcome === 'yes'
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                            : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <div className="font-bold text-lg mb-1">YES</div>
                        <div className="text-xs">{(stats.yesProb * 100).toFixed(1)}%</div>
                      </button>
                      <button
                        onClick={() => setSelectedOutcome('no')}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          selectedOutcome === 'no'
                            ? 'bg-red-500/20 border-red-500 text-red-400'
                            : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <div className="font-bold text-lg mb-1">NO</div>
                        <div className="text-xs">{(stats.noProb * 100).toFixed(1)}%</div>
                      </button>
                    </div>
                  </div>

                  {/* Bet Amount */}
                  <div className="mb-6">
                    <label className="text-sm font-medium text-slate-300 mb-2 block">Bet Amount (USDC)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={betAmount}
                        onChange={(e) => handleBetAmountChange(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-10 pr-4 py-3 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                      />
                    </div>
                    <div className="flex gap-2 mt-2">
                      {[10, 25, 50, 100].map((amount) => (
                        <button
                          key={amount}
                          onClick={() => setBetAmount(amount.toString())}
                          className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 transition-colors"
                        >
                          ${amount}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Calculation Summary */}
                  {betAmount && !isNaN(parseFloat(betAmount)) && (
                    <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Potential payout</span>
                        <span className="font-semibold text-emerald-400">${calculatePayout().toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Potential profit</span>
                        <span className="font-semibold text-green-400">+${calculateProfit().toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Current odds</span>
                        <span className="font-semibold">
                          {((selectedOutcome === 'yes' ? stats.yesProb : stats.noProb) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Place Bet Button */}
                  <button
                    onClick={handlePlaceBet}
                    disabled={
                      !wallet.publicKey ||
                      !betAmount ||
                      isNaN(parseFloat(betAmount)) ||
                      parseFloat(betAmount) <= 0 ||
                      isPlacingBet
                    }
                    className={`w-full py-4 rounded-xl font-semibold transition-all ${
                      !wallet.publicKey
                        ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                        : !betAmount || isNaN(parseFloat(betAmount)) || parseFloat(betAmount) <= 0 || isPlacingBet
                          ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                          : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40'
                    }`}
                  >
                    {!wallet.publicKey ? (
                      'Connect Wallet to Bet'
                    ) : isPlacingBet ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                        Placing Bet...
                      </span>
                    ) : (
                      `Bet on ${selectedOutcome.toUpperCase()}`
                    )}
                  </button>

                  {/* Info Box */}
                  <div className="mt-4 p-3 rounded-lg bg-slate-900/50 border border-slate-700/30">
                    <div className="flex items-start gap-2 text-xs text-slate-400">
                      <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <p>
                        In parimutuel betting, winners split the losing pool proportionally. Your final payout depends
                        on the total amounts bet on each outcome.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        {/* Market Resolved or Betting Closed Box */}
        {isBettingNotStartedYet() && !isResolved() && (
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50 backdrop-blur-sm">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-500/10 border-2 border-yellow-500/20 mb-4">
                    <Clock className="w-8 h-8 text-yellow-400" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Betting Not Open</h3>
                  <p className="text-slate-400 mb-4">
                    Betting will open on {formatDate(market.bettingStartTime || market.marketStart)}. Check back soon!
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        {isBettingClosed() && !isResolved() && (
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50 backdrop-blur-sm">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 border-2 border-blue-500/20 mb-4">
                    <Clock className="w-8 h-8 text-blue-400" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Betting Closed</h3>
                  <p className="text-slate-400 mb-4">
                    This market is currently in play. Betting is no longer available.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        {isResolved() && (
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50 backdrop-blur-sm">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 border-2 border-green-500/20 mb-4">
                    <CheckCircle className="w-8 h-8 text-green-400" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Market Settled</h3>
                  <p className="text-slate-400 mb-4">This market has been resolved and payouts are available.</p>
                  {getWinningDirection() && (
                    <div
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold ${
                        getWinningDirection() === 'YES'
                          ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
                          : getWinningDirection() === 'NO'
                            ? 'bg-red-500/20 border border-red-500/30 text-red-400'
                            : 'bg-yellow-500/20 border border-yellow-500/30 text-yellow-400'
                      }`}
                    >
                      {getWinningDirection() === 'YES' && <TrendingUp className="w-5 h-5" />}
                      {getWinningDirection() === 'NO' && <TrendingDown className="w-5 h-5" />}
                      Winner: {getWinningDirection()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
