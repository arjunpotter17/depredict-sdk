'use client'

import { useState, useEffect } from 'react'
import { PublicKey } from '@solana/web3.js'
import DepredictClient from '@endcorp/depredict'
import { useWallet } from '@solana/wallet-adapter-react'

export interface AdminWalletCreator {
  pda: string
  coreCollection: string
  merkleTree: string
  authority: string
  isVerified: boolean
}

export interface AdminWalletCreatorStatus {
  isChecking: boolean
  creator: AdminWalletCreator | null
  error: string | null
  isAuthorized: boolean // Add this to indicate if connected wallet is authority of env creator
}

export function useAdminWalletCreator(client: DepredictClient | null, isInitialized: boolean) {
  const { publicKey } = useWallet()
  const [status, setStatus] = useState<AdminWalletCreatorStatus>({
    isChecking: true,
    creator: null,
    error: null,
    isAuthorized: false,
  })

  useEffect(() => {
    const checkConnectedWalletCreator = async () => {
      if (!publicKey || !client || !isInitialized) {
        setStatus({
          isChecking: false,
          creator: null,
          error: null,
          isAuthorized: false,
        })
        return
      }

      setStatus(prev => ({ ...prev, isChecking: true }))

      try {
        // Get the env variable
        const adminKey = process.env.NEXT_PUBLIC_CREATOR_PUBLIC_ADMIN_KEY
        
        if (!adminKey) {
          // No env key, check if connected wallet has any creator
          const marketCreators = await client.program.account.marketCreator.all()
          
          const walletAuthority = publicKey.toBase58()
          
          const creatorsForWallet = marketCreators
            .map(({ account, publicKey }) => {
              const accountData = account as any
              return {
                pda: publicKey.toBase58(),
                authority: accountData.authority?.toBase58?.() || accountData.authority,
                coreCollection: accountData.coreCollection?.toBase58?.() || accountData.coreCollection,
                merkleTree: accountData.merkleTree?.toBase58?.() || accountData.merkleTree,
                isVerified: accountData.verified || false,
              }
            })
            .filter(mc => mc.authority === walletAuthority)

          if (creatorsForWallet.length > 0) {
            const mc = creatorsForWallet[0]
            setStatus({
              isChecking: false,
              creator: {
                pda: mc.pda,
                coreCollection: mc.coreCollection,
                merkleTree: mc.merkleTree,
                authority: mc.authority,
                isVerified: mc.isVerified,
              },
              error: null,
              isAuthorized: false, // Not env-based, so not "authorized"
            })
          } else {
            setStatus({
              isChecking: false,
              creator: null,
              error: null,
              isAuthorized: false,
            })
          }
        } else {
          // Env key exists, check if connected wallet is the authority of THAT specific creator
          const marketCreators = await client.program.account.marketCreator.all()
          
          // Find the env-based market creator
          const envCreatorPda = new PublicKey(adminKey)
          const envCreator = marketCreators.find(({ publicKey }) => 
            publicKey.toBase58() === envCreatorPda.toBase58()
          )

          if (envCreator) {
            const accountData = envCreator.account as any
            const authority = accountData.authority?.toBase58?.() || accountData.authority
            const connectedWallet = publicKey.toBase58()
            
            // Check if connected wallet is the authority
            if (authority === connectedWallet) {
              setStatus({
                isChecking: false,
                creator: {
                  pda: envCreator.publicKey.toBase58(),
                  coreCollection: accountData.coreCollection?.toBase58?.() || accountData.coreCollection,
                  merkleTree: accountData.merkleTree?.toBase58?.() || accountData.merkleTree,
                  authority: authority,
                  isVerified: accountData.verified || false,
                },
                error: null,
                isAuthorized: true, // Connected wallet IS the authority
              })
            } else {
              // Env creator exists but connected wallet is NOT the authority
              setStatus({
                isChecking: false,
                creator: null,
                error: null,
                isAuthorized: false,
              })
            }
          } else {
            // Env key points to a creator that doesn't exist
            setStatus({
              isChecking: false,
              creator: null,
              error: 'Market creator not found for env key',
              isAuthorized: false,
            })
          }
        }
      } catch (error) {
        console.error('Error checking wallet creator:', error)
        setStatus({
          isChecking: false,
          creator: null,
          error: error instanceof Error ? error.message : 'Unknown error',
          isAuthorized: false,
        })
      }
    }

    checkConnectedWalletCreator()
  }, [client, isInitialized, publicKey])

  return status
}