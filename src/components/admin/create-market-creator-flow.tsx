'use client'

import React, { useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'
import { useShortx } from '@/components/solana/useDepredict'
import { toast } from 'sonner'
import { Loader2, CheckCircle, AlertCircle, Shield, Copy, CheckCheck } from 'lucide-react'
import { useCreateCoreCollection } from '@/hooks/use-create-core-collection'
import { useCreateMerkleTree } from '@/hooks/use-create-merkle-tree'

interface CreateMarketCreatorFlowProps {
  onCreated: (pda: string) => void
}

export function CreateMarketCreatorFlow({ onCreated }: CreateMarketCreatorFlowProps) {
  const wallet = useWallet()
  const { connection } = useConnection()
  const { verifyMarketCreator, client } = useShortx()
  const { createCollection } = useCreateCoreCollection()
  const { createTree } = useCreateMerkleTree()

  const [step, setStep] = useState<'ready' | 'creating' | 'creating-collection' | 'creating-tree' | 'verifying' | 'complete'>('ready')
  const [isProcessing, setIsProcessing] = useState(false)
  const [marketCreatorPda, setMarketCreatorPda] = useState<string>('')
  const [coreCollection, setCoreCollection] = useState<string>('')
  const [merkleTree, setMerkleTree] = useState<string>('')
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldName)
      toast.success(`${fieldName} copied!`)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (error) {
      toast.error('Failed to copy')
    }
  }

  const handleCreateAndVerify = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      toast.error('Please connect your wallet')
      return
    }

    if (!client) {
      toast.error('SDK not initialized')
      return
    }

    setIsProcessing(true)
    setStep('creating')

    try {
      // Step 1: Create Market Creator using connected wallet
      toast.loading('Step 1: Creating market creator...', { id: 'mc-flow' })

      // Call the SDK method to create market creator with connected wallet
      const createResult = await client.marketCreator.createMarketCreator({
        name: 'Market Creator',
        feeVault: wallet.publicKey, // Use connected wallet as fee vault (can be changed later)
        creatorFeeBps: 100,
        signer: wallet.publicKey,
      })
      
      if (!createResult) {
        throw new Error('Failed to create market creator')
      }

      const { ixs, marketCreator } = createResult
      const pdaString = marketCreator.toBase58()
      setMarketCreatorPda(pdaString)

      // Build and sign transaction for market creator creation
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      const transaction = new Transaction()
      transaction.add(...ixs)
      transaction.recentBlockhash = blockhash
      transaction.feePayer = wallet.publicKey

      const signedTx = await wallet.signTransaction(transaction)
      const signature = await connection.sendRawTransaction(signedTx.serialize())
      
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      })

      console.log('✅ Market creator created:', pdaString)
      
      // Wait a bit for account to settle
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Step 2: Create Collection
      setStep('creating-collection')
      toast.loading('Step 2: Creating core collection...', { id: 'mc-flow' })

      const collectionResult = await createCollection(wallet.publicKey.toBase58(), pdaString)
      
      if (!collectionResult) {
        throw new Error('Failed to create collection')
      }
      
      setCoreCollection(collectionResult.publicKey)
      console.log('✅ Collection created:', collectionResult.publicKey)

      // Wait for collection to settle
      await new Promise(resolve => setTimeout(resolve, 3000))

      setStep('creating-tree')
      toast.loading('Step 3: Creating merkle tree...', { id: 'mc-flow' })

      const treeResult = await createTree(wallet.publicKey.toBase58(), pdaString)
      
      if (!treeResult) {
        throw new Error('Failed to create merkle tree')
      }
      
      setMerkleTree(treeResult.publicKey)
      console.log('✅ Merkle tree created:', treeResult.publicKey)

      // Wait for tree to settle
      await new Promise(resolve => setTimeout(resolve, 3000))

      setStep('verifying')
      toast.loading('Step 4: Verifying market creator...', { id: 'mc-flow' })

      const verifyIxs = await verifyMarketCreator({
        signer: wallet.publicKey,
        coreCollection: new PublicKey(collectionResult.publicKey),
        merkleTree: new PublicKey(treeResult.publicKey),
      })
      
      if (!verifyIxs) {
        throw new Error('Failed to verify market creator')
      }

      // Build and sign verify transaction
      const verifyBlockhash = await connection.getLatestBlockhash()
      const verifyTx = new Transaction()
      verifyTx.add(...verifyIxs)
      verifyTx.recentBlockhash = verifyBlockhash.blockhash
      verifyTx.feePayer = wallet.publicKey

      const signedVerifyTx = await wallet.signTransaction(verifyTx)
      const verifySignature = await connection.sendRawTransaction(signedVerifyTx.serialize())
      
      await connection.confirmTransaction({
        signature: verifySignature,
        blockhash: verifyBlockhash.blockhash,
        lastValidBlockHeight: verifyBlockhash.lastValidBlockHeight,
      })

      console.log('✅ Market creator verified')

      // Save to localStorage
      const marketCreatorDetails = {
        marketCreator: pdaString,
        adminKey: wallet.publicKey.toBase58(),
        coreCollection: collectionResult.publicKey,
        merkleTree: treeResult.publicKey,
        verified: true,
        createdAt: new Date().toISOString(),
      }
      
      localStorage.setItem('marketCreatorDetails', JSON.stringify(marketCreatorDetails))

      setStep('complete')
      toast.success('Market creator setup complete!', { id: 'mc-flow' })

    } catch (error: any) {
      console.error('Market creator flow error:', error)
      toast.error(`Failed: ${error.message}`, { id: 'mc-flow' })
      setStep('ready')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Info Card */}
      <div className="p-6 rounded-2xl bg-blue-500/10 border border-blue-500/20">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-blue-500/20">
            <Shield className="w-8 h-8 text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-blue-400 mb-2">Market Creator Setup Required</h3>
            <p className="text-slate-400 text-sm mb-4">
              To create and manage prediction markets, you need to set up a Market Creator account. 
              This is a one-time process that will:
            </p>
            <ul className="text-sm text-slate-400 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>Create a Market Creator account on-chain</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>Set up a Core Collection for NFT positions</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>Create a Merkle Tree for compressed NFTs</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>Verify the Market Creator as ready to use</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Setup Card */}
      {step === 'ready' && (
        <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50">
          <h2 className="text-2xl font-bold mb-4">Create Market Creator</h2>
          <p className="text-slate-400 mb-6">
            Click the button below to start the setup process. This will use your connected wallet as the admin and take a few moments with multiple transactions.
          </p>

          {wallet.publicKey && (
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-700/30 mb-6">
              <p className="text-sm text-slate-400 mb-2">Connected Wallet (will be admin):</p>
              <p className="font-mono text-sm text-purple-400 break-all">
                {wallet.publicKey.toBase58()}
              </p>
            </div>
          )}

          <button
            onClick={handleCreateAndVerify}
            disabled={!wallet.publicKey || isProcessing}
            className="w-full py-4 rounded-xl font-semibold transition-all bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {!wallet.publicKey ? (
              'Connect Wallet to Continue'
            ) : (
              'Create & Verify Market Creator'
            )}
          </button>
        </div>
      )}

      {/* Progress Card */}
      {(step === 'creating' || step === 'verifying' || step === 'creating-collection' || step === 'creating-tree') && (
        <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-6">
            <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
            <h2 className="text-2xl font-bold">
              {step === 'creating' ? 'Creating Market Creator...' : step === 'creating-collection' ? 'Creating Core Collection...' : step === 'creating-tree' ? 'Creating Merkle Tree...' : 'Verifying Market Creator...'}
            </h2>
          </div>

          <div className="space-y-3">
            <div className={`flex items-center gap-3 p-3 rounded-lg ${
              marketCreatorPda ? 'bg-green-500/10 border border-green-500/20' : 'bg-slate-900/50'
            }`}>
              {marketCreatorPda ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : (
                <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
              )}
              <span className="text-sm">Create Market Creator Account</span>
            </div>

            <div className={`flex items-center gap-3 p-3 rounded-lg ${
              coreCollection ? 'bg-green-500/10 border border-green-500/20' : 'bg-slate-900/50'
            }`}>
              {coreCollection ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : marketCreatorPda ? (
                <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-slate-700" />
              )}
              <span className="text-sm">Create Core Collection</span>
            </div>

            <div className={`flex items-center gap-3 p-3 rounded-lg ${
              merkleTree ? 'bg-green-500/10 border border-green-500/20' : 'bg-slate-900/50'
            }`}>
              {merkleTree ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : coreCollection ? (
                <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-slate-700" />
              )}
              <span className="text-sm">Create Merkle Tree</span>
            </div>

            <div className={`flex items-center gap-3 p-3 rounded-lg ${
              step === 'verifying' && merkleTree ? 'bg-slate-900/50' : 'bg-slate-900/50'
            }`}>
              {step === 'verifying' && merkleTree ? (
                <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-slate-700" />
              )}
              <span className="text-sm">Verify Market Creator</span>
            </div>
          </div>

          <p className="text-xs text-slate-500 mt-4 text-center">
            Please do not close this page. This process may take several minutes.
          </p>
        </div>
      )}

      {/* Success Card with Environment Setup Instructions */}
      {step === 'complete' && (
        <div className="p-6 rounded-2xl bg-green-500/10 border border-green-500/20">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle className="w-8 h-8 text-green-400" />
            <h2 className="text-2xl font-bold text-green-400">Setup Complete!</h2>
          </div>

          <p className="text-slate-400 mb-6">
            Your Market Creator has been successfully created and verified. 
            <strong className="text-white"> Follow the steps below to complete the setup:</strong>
          </p>

          {/* Step 1: Add to .env */}
          <div className="mb-6 p-5 rounded-xl bg-slate-900/50 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-sm font-bold">
                1
              </div>
              <h3 className="text-lg font-semibold">Add to your .env file</h3>
            </div>
            
            <p className="text-sm text-slate-400 mb-4">
              Copy the following lines and add them to your <code className="px-1.5 py-0.5 bg-slate-800 rounded text-purple-400">.env.local</code> file:
            </p>

            <div className="space-y-3">
              {/* Market Creator PDA env variable */}
              <div className="relative group">
                <div className="text-xs text-slate-500 mb-1">Market Creator PDA (used to fetch markets):</div>
                <pre className="p-4 rounded-lg bg-slate-950 border border-slate-700 overflow-x-auto text-xs">
                  <code className="text-green-400">
                    NEXT_PUBLIC_CREATOR_PUBLIC_ADMIN_KEY={marketCreatorPda}
                  </code>
                </pre>
                <button
                  onClick={() => copyToClipboard(
                    `NEXT_PUBLIC_CREATOR_PUBLIC_ADMIN_KEY=${marketCreatorPda}`,
                    'Market Creator env'
                  )}
                  className="absolute top-6 right-2 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 transition-all opacity-0 group-hover:opacity-100"
                >
                  {copiedField === 'Market Creator env' ? (
                    <CheckCheck className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-slate-400" />
                  )}
                </button>
              </div>

              {/* Collection Address env variable */}
              <div className="relative group">
                <div className="text-xs text-slate-500 mb-1">Core Collection Address (for NFT positions):</div>
                <pre className="p-4 rounded-lg bg-slate-950 border border-slate-700 overflow-x-auto text-xs">
                  <code className="text-green-400">
                    NEXT_PUBLIC_SHORTX_COLLECTION_ADDRESS={coreCollection}
                  </code>
                </pre>
                <button
                  onClick={() => copyToClipboard(
                    `NEXT_PUBLIC_SHORTX_COLLECTION_ADDRESS=${coreCollection}`,
                    'Collection env'
                  )}
                  className="absolute top-6 right-2 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 transition-all opacity-0 group-hover:opacity-100"
                >
                  {copiedField === 'Collection env' ? (
                    <CheckCheck className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-slate-400" />
                  )}
                </button>
              </div>

              {/* Copy all button */}
              <button
                onClick={() => copyToClipboard(
                  `NEXT_PUBLIC_CREATOR_PUBLIC_ADMIN_KEY=${marketCreatorPda}\nNEXT_PUBLIC_SHORTX_COLLECTION_ADDRESS=${coreCollection}`,
                  'All env variables'
                )}
                className="w-full mt-3 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-sm text-slate-300 transition-colors flex items-center justify-center gap-2"
              >
                {copiedField === 'All env variables' ? (
                  <>
                    <CheckCheck className="w-4 h-4 text-green-400" />
                    <span className="text-green-400">Copied Both!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy Both Variables
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Step 2: Restart server */}
          <div className="mb-6 p-5 rounded-xl bg-slate-900/50 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-sm font-bold">
                2
              </div>
              <h3 className="text-lg font-semibold">Restart your development server</h3>
            </div>
            
            <p className="text-sm text-slate-400 mb-4">
              Stop your current development server (Ctrl+C) and restart it to load the new environment variables:
            </p>

            <div className="p-4 rounded-lg bg-slate-950 border border-slate-700">
              <code className="text-sm text-slate-300">
                npm run dev
              </code>
            </div>
          </div>

          {/* Step 3: Reload page */}
          <div className="mb-6 p-5 rounded-xl bg-slate-900/50 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-sm font-bold">
                3
              </div>
              <h3 className="text-lg font-semibold">Reload this page</h3>
            </div>
            
            <p className="text-sm text-slate-400 mb-4">
              After restarting your server, reload this page to see your market creator dashboard.
            </p>

            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-medium transition-colors"
            >
              Reload Page
            </button>
          </div>

          {/* Reference Information */}
          <div className="space-y-3 text-sm">
            <p className="text-slate-400 font-semibold mb-3">Reference Information (saved to localStorage):</p>
            
            <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/30">
              <div className="flex items-center justify-between mb-1">
                <p className="text-slate-400">Admin Wallet:</p>
                <button
                  onClick={() => copyToClipboard(wallet.publicKey?.toBase58() || '', 'Admin wallet')}
                  className="text-purple-400 hover:text-purple-300 transition-colors"
                >
                  {copiedField === 'Admin wallet' ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="font-mono text-purple-400 break-all text-xs">{wallet.publicKey?.toBase58()}</p>
            </div>

            <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/30">
              <div className="flex items-center justify-between mb-1">
                <p className="text-slate-400">Market Creator PDA:</p>
                <button
                  onClick={() => copyToClipboard(marketCreatorPda, 'Market creator')}
                  className="text-purple-400 hover:text-purple-300 transition-colors"
                >
                  {copiedField === 'Market creator' ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="font-mono text-purple-400 break-all text-xs">{marketCreatorPda}</p>
            </div>

            <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/30">
              <div className="flex items-center justify-between mb-1">
                <p className="text-slate-400">Core Collection:</p>
                <button
                  onClick={() => copyToClipboard(coreCollection, 'Collection')}
                  className="text-purple-400 hover:text-purple-300 transition-colors"
                >
                  {copiedField === 'Collection' ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="font-mono text-purple-400 break-all text-xs">{coreCollection}</p>
            </div>

            <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/30">
              <div className="flex items-center justify-between mb-1">
                <p className="text-slate-400">Merkle Tree:</p>
                <button
                  onClick={() => copyToClipboard(merkleTree, 'Merkle tree')}
                  className="text-purple-400 hover:text-purple-300 transition-colors"
                >
                  {copiedField === 'Merkle tree' ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="font-mono text-purple-400 break-all text-xs">{merkleTree}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}