'use client'

import { useState } from 'react'
import { PublicKey, VersionedTransaction, Transaction } from '@solana/web3.js'
import { useWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import { useShortx } from '@/components/solana/useDepredict'
import { toast } from 'sonner'

export function useClaimAndBurn() {
  const [isProcessing, setIsProcessing] = useState(false)
  const wallet = useWallet()
  const { connection } = useConnection()
  const { client } = useShortx()

  const claimAndBurn = async (assetId: string, marketId: number) => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected')
    }

    if (!client) {
      throw new Error('SDK not initialized')
    }

    setIsProcessing(true)

    try {
      const rpcEndpoint = process.env.NEXT_PUBLIC_RPC_ENDPOINT!
      const assetPublicKey = new PublicKey(assetId)
      const payerPubkey = wallet.publicKey

      toast.loading('Preparing transaction...', { id: 'claim' })

      // Call payoutPosition with default returnMode (transaction)
      const result = await client.trade.payoutPosition({
        marketId,
        payer: payerPubkey,
        assetId: assetPublicKey,
        rpcEndpoint,
        returnMode: 'transaction',
      })

      if (!result) {
        throw new Error('No payout result received from SDK')
      }

      let signature: string

      // Handle different return types from SDK
      if ('transaction' in result) {
        // Got a transaction object
        const tx = result.transaction as VersionedTransaction
        
        toast.loading('Waiting for signature...', { id: 'claim' })

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
        
        // Update transaction with latest blockhash
        tx.message.recentBlockhash = blockhash
        
        // Sign the transaction
        const signedTx = await wallet.signTransaction(tx)
        
        toast.loading('Sending transaction...', { id: 'claim' })

        // Send and confirm
        signature = await connection.sendRawTransaction(signedTx.serialize())

        toast.loading('Confirming transaction...', { id: 'claim' })

        await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        })
      } else if ('ixs' in result) {
        // Got instructions, need to build transaction
        const ixs = result.ixs
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

        const tx = new Transaction()
        tx.add(...ixs)
        tx.recentBlockhash = blockhash
        tx.feePayer = payerPubkey

        toast.loading('Waiting for signature...', { id: 'claim' })
        
        const signedTx = await wallet.signTransaction(tx)

        toast.loading('Sending transaction...', { id: 'claim' })

        signature = await connection.sendRawTransaction(signedTx.serialize())

        toast.loading('Confirming transaction...', { id: 'claim' })

        await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        })
      } else {
        throw new Error('Unexpected result format from payoutPosition')
      }

      console.log('Claim successful:', signature)

      toast.success('Winnings claimed successfully!', { id: 'claim' })
      return { signature, success: true }
    } catch (error: any) {
      console.error('Claim error:', error)

      const errorMsg = error?.message || String(error)
      const errorLower = errorMsg.toLowerCase()

      if (errorLower.includes('user rejected') || errorLower.includes('user denied')) {
        toast.error('Transaction rejected', { id: 'claim' })
      } else if (errorLower.includes('proof') || errorLower.includes('invalid root')) {
        toast.error('Invalid proof - please try again', { id: 'claim' })
      } else {
        toast.error(`Failed: ${errorMsg.slice(0, 100)}`, { id: 'claim' })
      }
      throw error
    } finally {
      setIsProcessing(false)
    }
  }

  return {
    claimAndBurn,
    isProcessing,
  }
}