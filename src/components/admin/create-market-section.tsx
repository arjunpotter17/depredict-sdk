'use client'

import React, { useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, VersionedTransaction } from '@solana/web3.js'
import { useShortx } from '@/components/solana/useDepredict'
import { toast } from 'sonner'
import { Loader2, Calendar, DollarSign, Hash, AlertCircle } from 'lucide-react'
import { MarketType, OracleType } from '@endcorp/depredict'

export function CreateMarketSection() {
  const wallet = useWallet()
  const { connection } = useConnection()
  const { createMarket, ensureMarketLookupTable } = useShortx()

  const [isCreating, setIsCreating] = useState(false)
  const [formData, setFormData] = useState({
    question: '',
    bettingStartTime: '',
    marketStart: '',
    marketEnd: '',
    oraclePubkey: '',
    tokenMint: '',
    metadataUri: 'https://example.com/market-metadata.json',

  })

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  // Validation function for time fields
  const validateTimes = () => {
    if (!formData.bettingStartTime || !formData.marketStart || !formData.marketEnd) {
      return { valid: false, error: 'Please fill in all time fields' }
    }

    const now = Date.now()
    const bettingStart = new Date(formData.bettingStartTime).getTime()
    const marketStart = new Date(formData.marketStart).getTime()
    const marketEnd = new Date(formData.marketEnd).getTime()

    if (bettingStart <= now) {
      return { valid: false, error: 'Betting start time must be in the future' }
    }

    if (bettingStart >= marketStart) {
      return { valid: false, error: 'Betting start time must be before market start time' }
    }

    if (marketStart >= marketEnd) {
      return { valid: false, error: 'Market end time must be after market start time' }
    }

    return { valid: true, error: null }
  }

    // Validation function for token mint
    const validateMint = (mint: string): { valid: boolean; error: string | null } => {
      if (!mint.trim()) {
        return { valid: true, error: null } // Optional field
      }
      
      try {
        new PublicKey(mint)
        return { valid: true, error: null }
      } catch {
        return { valid: false, error: 'Invalid token mint address' }
      }
    }

  const handleCreateMarket = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      toast.error('Please connect your wallet')
      return
    }

    if (!formData.question) {
      toast.error('Please enter a market question')
      return
    }

    // Validate times
    const timeValidation = validateTimes()
    if (!timeValidation.valid) {
      toast.error(timeValidation.error!)
      return
    }

    const mintValidation = validateMint(formData.tokenMint)
    if (!mintValidation.valid) {
      toast.error(mintValidation.error!)
      return
    }

    setIsCreating(true)

    try {
      toast.loading('Preparing market creation...', { id: 'create-market' })

      // Convert dates to Unix timestamps
      const bettingStartTimestamp = Math.floor(new Date(formData.bettingStartTime).getTime() / 1000)
      const startTimestamp = Math.floor(new Date(formData.marketStart).getTime() / 1000)
      const endTimestamp = Math.floor(new Date(formData.marketEnd).getTime() / 1000)

      // Prepare market creation arguments
      const createMarketArgs = {
        question: formData.question,
        bettingStartTime: bettingStartTimestamp,
        startTime: startTimestamp,
        endTime: endTimestamp,
        oraclePubkey: formData.oraclePubkey ? new PublicKey(formData.oraclePubkey) : wallet.publicKey, // Default to wallet if not provided
        payer: wallet.publicKey,
        oracleType: OracleType.MANUAL,
        metadataUri: formData.metadataUri,
        feeVaultAccount: wallet.publicKey,
        marketType: MarketType.FUTURE,
        ...(formData.tokenMint.trim() && { mintAddress: new PublicKey(formData.tokenMint.trim()) }),
      }

      console.log('Creating market with args:', createMarketArgs)

      const result = await createMarket(createMarketArgs)

      if (!result) {
        throw new Error('Failed to create market transaction')
      }

      const { tx, marketId } = result

      console.log('Market ID:', marketId)

      // Get the latest blockhash for transaction confirmation
      toast.loading('Waiting for signature...', { id: 'create-market' })

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

      // The transaction might already have a blockhash, but we'll update it to be sure
      tx.message.recentBlockhash = blockhash

      // Sign the transaction
      const signedTx = await wallet.signTransaction(tx)

      toast.loading('Sending transaction...', { id: 'create-market' })

      // Send the signed transaction
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })

      console.log('Transaction signature:', signature)

      toast.loading('Confirming transaction...', { id: 'create-market' })

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

      console.log('Market created successfully! Market ID:', marketId);

       // Fetch cached creator lookup table from localStorage
       toast.loading('Setting up market lookup table...', { id: 'create-market' })

       let creatorLookupTableAddress: PublicKey | undefined
       try {
         const marketCreatorDetails = localStorage.getItem('marketCreatorDetails')
         if (marketCreatorDetails) {
           const details = JSON.parse(marketCreatorDetails)
           if (details.lookupTableAddress) {
             creatorLookupTableAddress = new PublicKey(details.lookupTableAddress)
             console.log('Using creator lookup table:', details.lookupTableAddress)
           }
         }
       } catch (err) {
         console.warn('Failed to load creator lookup table from localStorage:', err)
       }
 
       // Ensure market lookup table exists
       if (creatorLookupTableAddress) {
         // Wait 5 seconds to allow time for the market state account creation
         await new Promise((resolve) => setTimeout(resolve, 5000))
         try {
           // Retry logic for ensureMarketLookupTable in case the market account is not yet ready
           let ensureResult = null
           const maxRetries = 7
           const retryDelayMs = 4000
           let lastError: any = null

           for (let attempt = 0; attempt < maxRetries; attempt++) {
             try {
               ensureResult = await ensureMarketLookupTable({
                 marketId,
                 authority: wallet.publicKey,
                 payer: wallet.publicKey,
                 creatorLookupTableAddress: creatorLookupTableAddress,
                 pageIndexes: [0, 1], // Prewarm first two pages
               })
               if (ensureResult) {
                 if (attempt > 0) {
                   console.log(`Market lookup table available after ${attempt+1} attempt(s)`)
                 }
                 break
               }
               lastError = null
               console.log(`Market lookup table not ready yet (attempt ${attempt+1}/${maxRetries})`)
             } catch (err) {
               lastError = err
               console.warn(`Error ensuring market lookup table (attempt ${attempt+1}/${maxRetries}):`, err)
             }
             // Wait before retrying
             await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
           }

           if (!ensureResult) {
             throw new Error(
               `Failed to setup market lookup table after ${maxRetries} attempts` +
               (lastError ? `: ${lastError.message || lastError}` : '')
             )
           }

           console.log('Ensure result:', ensureResult)
 
           if (ensureResult) {
             console.log('Market lookup table address:', ensureResult.lookupTableAddress.toBase58())
 
             // Collect all transactions (create + extends)
             const txs = [
              ensureResult.createTx,
              ...(ensureResult.extendTxs ?? []),
            ].filter((tx): tx is VersionedTransaction => tx !== null && tx !== undefined)
 
             // Sign and send all transactions
             if (txs.length > 0) {
               toast.loading(`Setting up lookup table (${txs.length} transaction${txs.length > 1 ? 's' : ''})...`, { id: 'create-market' })
 
               for (let i = 0; i < txs.length; i++) {
                 const tx = txs[i]
                 const txBlockhash = await connection.getLatestBlockhash()
                 tx.message.recentBlockhash = txBlockhash.blockhash
 
                 toast.loading(`Signing lookup table transaction (${i + 1}/${txs.length})...`, { id: 'create-market' })
 
                 const signedTx = await wallet.signTransaction(tx)
                 const txSignature = await connection.sendRawTransaction(signedTx.serialize())
 
                 await connection.confirmTransaction({
                   signature: txSignature,
                   blockhash: txBlockhash.blockhash,
                   lastValidBlockHeight: txBlockhash.lastValidBlockHeight,
                 }, 'confirmed')
 
                 console.log(`✅ Lookup table transaction ${i + 1}/${txs.length} confirmed:`, txSignature)
 
                 // Wait between transactions
                 if (i < txs.length - 1) {
                   await new Promise((resolve) => setTimeout(resolve, 2000))
                 }
               }
 
               console.log('✅ Market lookup table setup complete:', ensureResult.lookupTableAddress.toBase58())
 
               // Store the lookup table address (you might want to save this to a market metadata store)
               // For now, we'll just log it
               const marketMetadata = {
                 marketId,
                 lookupTableAddress: ensureResult.lookupTableAddress.toBase58(),
                 createdAt: new Date().toISOString(),
               }

               localStorage.setItem(`marketMetadata-${marketId}`, JSON.stringify(marketMetadata))
               console.log('Market metadata:', marketMetadata)
             }
           }
         } catch (lutError: any) {
           console.error('Failed to setup market lookup table:', lutError)
           // Don't throw - market was created successfully, LUT is optional optimization
           toast.error('Market created but lookup table setup failed', { id: 'create-market' })
         }
       }

      toast.success(
        `Market created successfully! Market ID: ${marketId}`,
        { 
          id: 'create-market',
          duration: 5000,
        }
      )

      // Reset form
      setFormData({
        question: '',
        bettingStartTime: '',
        marketStart: '',
        marketEnd: '',
        oraclePubkey: '',
        metadataUri: 'https://example.com/market-metadata.json',
        tokenMint: '',
      })

    } catch (error: any) {
      console.error('Create market error:', error)
      
      const errorMsg = error?.message || String(error)
      const errorLower = errorMsg.toLowerCase()

      if (errorLower.includes('user rejected') || errorLower.includes('user denied')) {
        toast.error('Transaction rejected', { id: 'create-market' })
      } else if (errorLower.includes('insufficient funds')) {
        toast.error('Insufficient funds to create market', { id: 'create-market' })
      } else if (errorLower.includes('blockhash not found')) {
        toast.error('Transaction expired, please try again', { id: 'create-market' })
      } else {
        toast.error(`Failed: ${errorMsg.slice(0, 100)}`, { id: 'create-market' })
      }
    } finally {
      setIsCreating(false)
    }
  }

  // Get validation errors for display
  const getTimeValidationErrors = () => {
    if (!formData.bettingStartTime && !formData.marketStart && !formData.marketEnd) {
      return []
    }

    const errors: string[] = []
    const now = Date.now()

    if (formData.bettingStartTime) {
      const bettingStart = new Date(formData.bettingStartTime).getTime()
      if (bettingStart <= now) {
        errors.push('Betting start time must be in the future')
      }
    }

    if (formData.bettingStartTime && formData.marketStart) {
      const bettingStart = new Date(formData.bettingStartTime).getTime()
      const marketStart = new Date(formData.marketStart).getTime()
      if (bettingStart >= marketStart) {
        errors.push('Betting start must be before market start')
      }
    }

    if (formData.marketStart && formData.marketEnd) {
      const marketStart = new Date(formData.marketStart).getTime()
      const marketEnd = new Date(formData.marketEnd).getTime()
      if (marketStart >= marketEnd) {
        errors.push('Market end must be after market start')
      }
    }

    return errors
  }

  const validationErrors = getTimeValidationErrors()

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50">
        <h2 className="text-2xl font-bold mb-4">Create New Market</h2>
        <p className="text-slate-400 mb-6">Set up a new prediction market with your desired parameters.</p>

        <div className="space-y-4">
          {/* Question */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">Market Question *</label>
            <textarea
              value={formData.question}
              onChange={(e) => handleInputChange('question', e.target.value)}
              placeholder="E.g., Will Manchester United beat Chelsea in Premier League?"
              rows={3}
              maxLength={200}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all resize-none"
            />
            <p className="text-xs text-slate-500 mt-1">{formData.question.length}/200 characters</p>
          </div>

          {/* Betting Start Time */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Betting Start Time *
            </label>
            <input
              type="datetime-local"
              value={formData.bettingStartTime}
              onChange={(e) => handleInputChange('bettingStartTime', e.target.value)}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all"
            />
            <p className="text-xs text-slate-500 mt-1">
              When users can start placing bets (must be after now and before market start)
            </p>
          </div>

          {/* Market Start Time */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Market Start Time *
            </label>
            <input
              type="datetime-local"
              value={formData.marketStart}
              onChange={(e) => handleInputChange('marketStart', e.target.value)}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all"
            />
            <p className="text-xs text-slate-500 mt-1">When the event/market officially starts (betting closes)</p>
          </div>

          {/* Market End Time */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Market End Time *
            </label>
            <input
              type="datetime-local"
              value={formData.marketEnd}
              onChange={(e) => handleInputChange('marketEnd', e.target.value)}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all"
            />
            <p className="text-xs text-slate-500 mt-1">When the market can be resolved</p>
          </div>

          {/* Time Validation Errors */}
          {validationErrors.length > 0 && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-400 mb-1">Time Validation Errors:</p>
                  <ul className="text-xs text-red-300 space-y-1">
                    {validationErrors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Metadata URI */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">Metadata URI (Optional)</label>
            <input
              type="text"
              value={formData.metadataUri}
              onChange={(e) => handleInputChange('metadataUri', e.target.value)}
              placeholder="https://example.com/market-metadata.json"
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all text-sm"
            />
          </div>

          {/* Token Mint */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Token Mint Address (Optional)
            </label>
            <input
              type="text"
              value={formData.tokenMint}
              onChange={(e) => handleInputChange('tokenMint', e.target.value)}
              placeholder="mint address of the token for this market"
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all text-sm font-mono"
            />
            {formData.tokenMint && !validateMint(formData.tokenMint).valid && (
              <p className="text-xs text-red-400 mt-1">Invalid token mint address</p>
            )}
            <p className="text-xs text-slate-500 mt-1">
              Specify a token mint address for this market. Leave blank to use devnet USDC.
            </p>
          </div>

          {/* Create Button */}
          <button
            onClick={handleCreateMarket}
            disabled={
              !wallet.publicKey ||
              isCreating ||
              !formData.question ||
              !formData.bettingStartTime ||
              !formData.marketStart ||
              !formData.marketEnd ||
              validationErrors.length > 0 ||
              !validateMint(formData.tokenMint).valid
            }
            className="w-full py-4 rounded-xl font-semibold transition-all bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating Market...
              </span>
            ) : !wallet.publicKey ? (
              'Connect Wallet to Create Market'
            ) : (
              'Create Market'
            )}
          </button>
        </div>
      </div>

      {/* Info Box */}
      <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-500/20">
            <Hash className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-blue-400 mb-1">Market Creation Tips</h3>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• Make your question clear and unambiguous</li>
              <li>• Betting start must be after now and before market start</li>
              <li>• Market start is when betting closes and the event begins</li>
              <li>• Manual oracle means you`&apos;`ll need to resolve the market yourself</li>
              <li>• Initial liquidity helps bootstrap trading</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
