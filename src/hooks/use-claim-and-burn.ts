'use client'

import { useState } from 'react'
import { PublicKey, VersionedTransaction, AddressLookupTableAccount, Transaction } from '@solana/web3.js'
import { useWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import { useShortx } from '@/components/solana/useDepredict'
import { toast } from 'sonner'
import BN from 'bn.js'

// Helper to fetch asset proof from DAS API
async function fetchAssetProof(assetId: string, rpcEndpoint: string) {
  const response = await fetch(rpcEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      method: 'getAssetProof',
      params: {
        id: assetId,
      },
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to fetch asset proof')
  }

  const data = await response.json()
  if (data.error) {
    throw new Error(data.error.message || 'Failed to fetch asset proof')
  }

  return {
    root: data.result.root ? Array.from(Buffer.from(data.result.root, 'base64')) : [],
    dataHash: data.result.dataHash ? Array.from(Buffer.from(data.result.dataHash, 'base64')) : [],
    creatorHash: data.result.creatorHash ? Array.from(Buffer.from(data.result.creatorHash, 'base64')) : [],
    nonce: new BN(data.result.leafNonce || 0),
    index: data.result.leafIndex || 0,
    proof: data.result.proof || [],
  }
}

// Helper to submit extend transaction with retry
async function submitExtendTransaction(
  wallet: any,
  connection: any,
  extendTx: VersionedTransaction,
  retries = 3,
): Promise<string> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const txBlockhash = await connection.getLatestBlockhash()
      extendTx.message.recentBlockhash = txBlockhash.blockhash

      const signedExtendTx = await wallet.signTransaction(extendTx)
      const extendSignature = await connection.sendRawTransaction(signedExtendTx.serialize())

      await connection.confirmTransaction({
        signature: extendSignature,
        blockhash: txBlockhash.blockhash,
        lastValidBlockHeight: txBlockhash.lastValidBlockHeight,
      }, 'confirmed')

      return extendSignature
    } catch (error: any) {
      lastError = error
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
      }
    }
  }

  throw lastError || new Error('Failed to submit extend transaction')
}

export function useClaimAndBurn() {
  const [isProcessing, setIsProcessing] = useState(false)
  const wallet = useWallet()
  const { connection } = useConnection()
  const { client, buildSettleInstructionWithProof, extendMarketLookupTable } = useShortx()

  const claimAndBurn = async (assetId: string, marketId: number) => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected')
    }

    if (!client || !buildSettleInstructionWithProof || !extendMarketLookupTable) {
      throw new Error('SDK not initialized')
    }

    setIsProcessing(true)

    try {
      const rpcEndpoint = process.env.NEXT_PUBLIC_RPC_ENDPOINT!
      const assetPublicKey = new PublicKey(assetId)
      const payerPubkey = wallet.publicKey

      toast.loading('Finding position...', { id: 'claim' })

      // Step 1: Find position by asset ID
      const positionAccount = await (client as any).position.getAccountByAssetAndMarket(
        marketId,
        assetPublicKey,
      )

      if (!positionAccount) {
        throw new Error('Position not found for this asset')
      }

      toast.loading('Fetching asset proof...', { id: 'claim' })

      // Step 2: Fetch asset proof
      const proof = await fetchAssetProof(assetId, rpcEndpoint)

      // Step 3: Load lookup tables from localStorage
      toast.loading('Loading lookup tables...', { id: 'claim' })

      let creatorLookupAddress: PublicKey | null = null
      let marketLookupAddress: PublicKey | null = null
      let creatorAuthority: PublicKey | null = null

      try {
        // Get creator lookup table from market creator details
        const marketCreatorDetails = localStorage.getItem('marketCreatorDetails')
        if (marketCreatorDetails) {
          const details = JSON.parse(marketCreatorDetails)
          if (details.lookupTableAddress) {
            creatorLookupAddress = new PublicKey(details.lookupTableAddress)
          }
          if (details.adminKey) {
            creatorAuthority = new PublicKey(details.adminKey)
          }
        }

        // Get market lookup table from market metadata
        const marketMetadataStr = localStorage.getItem(`marketMetadata-${marketId}`)
        if (marketMetadataStr) {
          const marketMetadata = JSON.parse(marketMetadataStr)
          if (marketMetadata.lookupTableAddress) {
            marketLookupAddress = new PublicKey(marketMetadata.lookupTableAddress)
          }
        }
      } catch (err) {
        console.warn('Failed to load lookup tables from localStorage:', err)
      }

      // Step 4: Extend market lookup table with proof nodes if LUTs exist
      if (creatorLookupAddress && marketLookupAddress && creatorAuthority) {
        try {
          toast.loading('Extending market lookup table...', { id: 'claim' })

          const extendResult = await extendMarketLookupTable({
            marketId,
            authority: creatorAuthority,
            lookupTableAddress: marketLookupAddress,
            creatorLookupTableAddress: creatorLookupAddress,
            proofNodes: proof.proof,
          })

          if (extendResult && extendResult.extendTxs.length > 0) {
            toast.loading(`Submitting ${extendResult.extendTxs.length} lookup table extension(s)...`, { id: 'claim' })

            // Submit each extend transaction with retry
            for (let i = 0; i < extendResult.extendTxs.length; i++) {
              const extendTx = extendResult.extendTxs[i]
              
              toast.loading(`Extending lookup table (${i + 1}/${extendResult.extendTxs.length})...`, { id: 'claim' })
              
              await submitExtendTransaction(wallet, connection, extendTx)
              
              console.log(`✅ Lookup table extended ${i + 1}/${extendResult.extendTxs.length}`)

              // Wait between extends
              if (i < extendResult.extendTxs.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 2000))
              }
            }

            console.log('✅ Market lookup table extension complete')
          }
        } catch (extendError: any) {
          console.warn('Failed to extend market lookup table:', extendError)
          // Continue - LUT extension is optional optimization
        }
      }

      toast.loading('Building settle instruction...', { id: 'claim' })

      // Step 5: Build settle instruction with proof
      const settleResult = await buildSettleInstructionWithProof({
        marketId,
        claimer: payerPubkey,
        assetId: assetPublicKey,
        pageIndex: positionAccount.pageIndex,
        slotIndex: positionAccount.slotIndex ?? null,
        proof: {
          root: proof.root,
          dataHash: proof.dataHash,
          creatorHash: proof.creatorHash,
          nonce: proof.nonce,
          leafIndex: proof.index,
          proofNodes: proof.proof,
        },
      })

      if (!settleResult) {
        throw new Error('Failed to build settle instruction')
      }

      toast.loading('Building transaction...', { id: 'claim' })

      // Step 6: Build versioned transaction with LUT addresses
      let tx: VersionedTransaction

      if (creatorLookupAddress && marketLookupAddress) {
        // Build v0 transaction with lookup tables
        try {
          const { message } = await (client as any).buildV0Message(
            [settleResult.instruction],
            payerPubkey,
            [creatorLookupAddress.toBase58(), marketLookupAddress.toBase58()],
          )
          tx = new VersionedTransaction(message)
        } catch (error) {
          console.warn('Failed to build v0 message, falling back to legacy transaction:', error)
          // Fallback to legacy transaction if v0 build fails
          const { blockhash } = await connection.getLatestBlockhash()
          const legacyTx = new Transaction()
          legacyTx.add(settleResult.instruction)
          legacyTx.recentBlockhash = blockhash
          legacyTx.feePayer = payerPubkey
          tx = new VersionedTransaction(legacyTx.compileMessage())
        }
      } else {
        // No LUTs, build legacy transaction
        const { blockhash } = await connection.getLatestBlockhash()
        const legacyTx = new Transaction()
        legacyTx.add(settleResult.instruction)
        legacyTx.recentBlockhash = blockhash
        legacyTx.feePayer = payerPubkey
        tx = new VersionedTransaction(legacyTx.compileMessage())
      }

      // Update blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      tx.message.recentBlockhash = blockhash

      toast.loading('Waiting for signature...', { id: 'claim' })

      const signedTx = await wallet.signTransaction(tx)

      toast.loading('Sending transaction...', { id: 'claim' })

      const signature = await connection.sendRawTransaction(signedTx.serialize())

      toast.loading('Confirming transaction...', { id: 'claim' })

      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      })

      console.log('Claim successful:', signature)

      toast.success('Winnings claimed successfully!', { id: 'claim' })
      return { signature, success: true }
    } catch (error: any) {
      console.error('Claim error:', error)

      const errorMsg = error?.message || String(error)
      const errorLower = errorMsg.toLowerCase()

      if (errorLower.includes('user rejected') || errorLower.includes('user denied')) {
        toast.error('Transaction rejected', { id: 'claim' })
      } else if (errorLower.includes('position not found')) {
        toast.error('Position not found - may already be claimed', { id: 'claim' })
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