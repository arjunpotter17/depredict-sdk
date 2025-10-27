'use client'

import { useState, useEffect } from 'react'
import { PublicKey } from '@solana/web3.js'
import DepredictClient from '@endcorp/depredict'

export interface MarketCreatorStatus {
  exists: boolean
  pda: string | null
  isChecking: boolean
  error: string | null
  hasEnvKey: boolean
  isVerified: boolean
}

export function useMarketCreator(client: DepredictClient | null, isInitialized: boolean) {
  const [status, setStatus] = useState<MarketCreatorStatus>({
    exists: false,
    pda: null,
    isChecking: true,
    error: null,
    hasEnvKey: false,
    isVerified: false,
  })

  useEffect(() => {
    const checkMarketCreator = async () => {
      setStatus(prev => ({ ...prev, isChecking: true }))

      try {
        // Step 1: Check if env variable exists
        const adminKey = process.env.NEXT_PUBLIC_CREATOR_PUBLIC_ADMIN_KEY

        if (!adminKey) {
          console.log('No NEXT_PUBLIC_CREATOR_PUBLIC_ADMIN_KEY found in environment')
          setStatus({
            exists: false,
            pda: null,
            isChecking: false,
            error: null,
            hasEnvKey: false,
            isVerified: false,
          })
          return
        }

        // Step 2: If env exists, check if market creator exists on-chain
        if (!client || !isInitialized) {
          return // Wait for SDK to initialize
        }

        try {
          const adminPubkey = new PublicKey(adminKey)

          // Fetch ALL market creators from the program
          const marketCreators = await client.program.account.marketCreator.all()
          const accounts = marketCreators.map(({ account, publicKey }) => ({
            account,
            publicKey: publicKey.toBase58(),
          }))


          // Find the market creator matching our expected PDA
          const ourMarketCreator = accounts.find(({ publicKey }) => publicKey === adminPubkey.toBase58())

          if (ourMarketCreator) {
            const verified = (ourMarketCreator.account as any).verified || false
            
            setStatus({
              exists: true,
              pda: ourMarketCreator.publicKey,
              isChecking: false,
              error: null,
              hasEnvKey: true,
              isVerified: verified,
            })
          } else {
            console.log('Market creator not found for admin key')
            setStatus({
              exists: false,
              pda: null,
              isChecking: false,
              error: null,
              hasEnvKey: true,
              isVerified: false,
            })
          }
        } catch (error) {
          console.log('Error fetching market creators:', error)
          setStatus({
            exists: false,
            pda: null,
            isChecking: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            hasEnvKey: true,
            isVerified: false,
          })
        }
      } catch (error) {
        console.error('Error checking market creator:', error)
        setStatus({
          exists: false,
          pda: null,
          isChecking: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          hasEnvKey: false,
          isVerified: false,
        })
      }
    }

    checkMarketCreator()
  }, [client, isInitialized])

  return status
}
