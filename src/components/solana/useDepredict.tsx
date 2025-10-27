import React, { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react'
import DepredictClient from '@endcorp/depredict'
import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js'
import { Market, OpenOrderArgs, CreateMarketArgs, MarketStates, WinningDirection } from '@endcorp/depredict'
import { Position } from '@endcorp/depredict'
import BN from 'bn.js'
import { useSolana } from './use-solana'
import { useMarketCreator, MarketCreatorStatus } from '@/hooks/use-market-creator'

export enum DepredictErrorType {
  MARKET_CREATION = 'MARKET_CREATION',
  POSITION_OPENING = 'POSITION_OPENING',
  PAYOUT = 'PAYOUT',
  MARKET_UPDATE = 'MARKET_UPDATE',
  MARKET_RESOLUTION = 'MARKET_RESOLUTION',
  MARKET_CLOSURE = 'MARKET_CLOSURE',
  MARKET_FETCH = 'MARKET_FETCH',
  POSITION_FETCH = 'POSITION_FETCH',
  MARKET_CREATOR_CREATION = 'MARKET_CREATOR_CREATION',
  INITIALIZATION = 'INITIALIZATION',
}

interface DepredictError extends Error {
  type: DepredictErrorType
  originalError?: unknown
}

export interface ConfigAccount {
  bump: number
  authority: PublicKey
  feeVault: PublicKey
  feeAmount: number
  version: number
  nextMarketId: BN
  globalMarkets: BN
  baseUri: number[]
}

interface ShortxContextType {
  client: DepredictClient | null
  markets: Market[]
  loadingMarkets: boolean
  error: DepredictError | null
  isInitialized: boolean
  marketCreatorStatus: MarketCreatorStatus
  recentTrades: Position[]
  marketEvents: {
    marketId: number
    state: string
    yesLiquidity: number
    noLiquidity: number
    volume: number
    updateTs: number
    nextPositionId: number
    marketStart: number
    marketEnd: number
    winningDirection: WinningDirection
  }[]
  refresh: () => void
  openPosition: (
    args: Omit<OpenOrderArgs, 'direction'> & {
      direction: { yes: object } | { no: object }
    },
  ) => Promise<
    | string
    | {
        ixs: TransactionInstruction[]
        addressLookupTableAccounts: AddressLookupTableAccount[]
      }
    | undefined
    | null
  >
  getAllPositionPagesForMarket: (marketId: number) => Promise<PositionPageInfo[] | null>
  payoutPosition: (args: { marketId: number; payer: PublicKey; assetId: PublicKey }) => Promise<any | null>
  createMarket: (args: CreateMarketArgs) => Promise<{ tx: VersionedTransaction; marketId: number } | null>
  updateMarket: (
    marketId: number,
    payer: PublicKey,
    marketEnd?: number,
    marketState?: MarketStates,
  ) => Promise<VersionedTransaction | null>
  resolveMarket: (args: {
    marketId: number
    resolutionValue: 10 | 11
    payer: PublicKey
  }) => Promise<VersionedTransaction | null>
  closeMarket: (marketId: number, payer: PublicKey) => Promise<TransactionInstruction[] | null>
  createMarketCreator: () => Promise<{ ixs: TransactionInstruction[]; marketCreator: PublicKey } | null>
  verifyMarketCreator: (args: {
    signer: PublicKey
    coreCollection: PublicKey
    merkleTree: PublicKey
  }) => Promise<TransactionInstruction[] | null>
  updateMarketCreatorName: (args: { signer: PublicKey; newName: string }) => Promise<TransactionInstruction[] | null>
  updateMarketCreatorFeeVault: (args: {
    signer: PublicKey
    currentFeeVault: PublicKey
    newFeeVault: PublicKey
  }) => Promise<TransactionInstruction[] | null>
  updateMarketCreatorFee: (args: {
    signer: PublicKey
    creatorFeeBps: number
  }) => Promise<TransactionInstruction[] | null>
  updateMerkleTree: (args: { signer: PublicKey; newTree: PublicKey }) => Promise<TransactionInstruction[] | null>
  updateMarketOptimistic: (marketId: string, updates: Partial<Market>) => void
}

type PositionPageInfo = {
  pageIndex: number
  totalSlots: number
  usedSlots: number
  availableSlots: number
  isFull: boolean
  prewarmNext: boolean
  exists: boolean
}

const ShortxContext = createContext<ShortxContextType | undefined>(undefined)

export const DepredictProvider = ({ children }: { children: ReactNode }) => {
  const connection = useMemo(
    () => new Connection(process.env.NEXT_PUBLIC_RPC_ENDPOINT!),
    []
  )
  const [client, setClient] = useState<DepredictClient | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [markets, setMarkets] = useState<Market[]>([])
  const [loadingMarkets, setLoadingMarkets] = useState(true)
  const [depredictError, setDepredictError] = useState<DepredictError | null>(null)
  const [refreshCount, setRefreshCount] = useState(0)
  const marketCreatorStatus = useMarketCreator(client, isInitialized);
  const [recentTrades, setRecentTrades] = useState<Position[]>([])
  const [marketEvents, setMarketEvents] = useState<
    {
      marketId: number
      state: string
      yesLiquidity: number
      noLiquidity: number
      volume: number
      updateTs: number
      nextPositionId: number
      marketStart: number
      marketEnd: number
      winningDirection: WinningDirection
    }[]
  >([])
  const [eventSubscriptions, setEventSubscriptions] = useState<number[]>([])
  const refresh = () => setRefreshCount((c) => c + 1)

  const createShortxError = (type: DepredictErrorType, message: string, originalError?: unknown): DepredictError => {
    const error = new Error(message) as DepredictError
    error.type = type
    error.originalError = originalError
    return error
  }

  //init SDK on load
  useEffect(() => {
    if (connection && !client && !depredictError) {
      try {
        const shortxClient = new DepredictClient(connection)
        setClient(shortxClient)
        setIsInitialized(true)
        console.log(`SDK initialized for DEVNET`)
      } catch (err) {
        setIsInitialized(false)
        if(depredictError) return
        setDepredictError(createShortxError(DepredictErrorType.INITIALIZATION, 'Failed to initialize SDK', err))
     
      }
    }
  }, [connection, client, depredictError])

  //fetch markets on load
  useEffect(() => {
    // Only fetch markets if market creator exists and is verified
    if (!client || !isInitialized || !marketCreatorStatus.exists || !marketCreatorStatus.isVerified) {
      console.log('Skipping market fetch:', {
        hasClient: !!client,
        isInitialized: isInitialized,
        marketCreatorExists: marketCreatorStatus.exists,
        isVerified: marketCreatorStatus.isVerified,
      })
      setLoadingMarkets(false)
      return
    }
    
    fetchAllMarkets()
  }, [client, refreshCount, marketCreatorStatus.exists, marketCreatorStatus.isVerified])

  // Update markets in real-time when market events are received
  useEffect(() => {
    if (marketEvents.length === 0) return

    const latestEvent = marketEvents[0] // Get the most recent event

    // Reduce main-thread blocking by batching updates
    // @ts-ignore startTransition exists in React 18
    const run = (React as any).startTransition || ((fn: any) => fn())
    run(() =>
      setMarkets((prevMarkets) => {
        const existingMarketIndex = prevMarkets.findIndex(
          (market) => market.marketId === latestEvent.marketId.toString(),
        )

        if (existingMarketIndex !== -1) {
          // Update existing market with new data from event
          const updatedMarkets = [...prevMarkets]
          const existingMarket = updatedMarkets[existingMarketIndex]

          // Convert winningDirection from object format to enum
          let winningDirection: WinningDirection
          if (latestEvent.winningDirection && typeof latestEvent.winningDirection === 'object') {
            if ('yes' in latestEvent.winningDirection) {
              winningDirection = WinningDirection.YES
            } else if ('no' in latestEvent.winningDirection) {
              winningDirection = WinningDirection.NO
            } else if ('draw' in latestEvent.winningDirection) {
              winningDirection = WinningDirection.DRAW
            } else if ('none' in latestEvent.winningDirection) {
              winningDirection = WinningDirection.NONE
            } else {
              winningDirection = WinningDirection.NONE
            }
          } else {
            winningDirection = latestEvent.winningDirection as WinningDirection
          }

          updatedMarkets[existingMarketIndex] = {
            ...existingMarket,
            yesLiquidity: latestEvent.yesLiquidity.toString(),
            noLiquidity: latestEvent.noLiquidity.toString(),
            volume: latestEvent.volume.toString(),
            marketStart: latestEvent.marketStart.toString(),
            marketEnd: latestEvent.marketEnd.toString(),
            // Preserve the original winningDirection unless the event indicates a resolution
            winningDirection: winningDirection,
            marketState: latestEvent.state as any,
            nextPositionId: latestEvent.nextPositionId.toString(),
          }

          return updatedMarkets
        } else {
          // Fetch the new market and add it to the list
          const fetchNewMarket = async () => {
            try {
              if (client) {
                const newMarket = await client.trade.getMarketById(latestEvent.marketId)
                if (newMarket) {
                  run(() =>
                    setMarkets((prev) => {
                      // Check if market already exists to prevent duplicates
                      const marketExists = prev.some((market) => market.marketId === latestEvent.marketId.toString())
                      if (marketExists) {
                        // console.log(`Market ${latestEvent.marketId} already exists in list, skipping...`);
                        return prev
                      }
                      // console.log(`Added new market ${latestEvent.marketId} to the list`);
                      return [newMarket, ...prev]
                    }),
                  )
                }
              }
            } catch (error) {
              console.error(`Error fetching new market ${latestEvent.marketId}:`, error)
            }
          }

          fetchNewMarket()
          return prevMarkets // Return current markets while fetching
        }
      }),
    )
  }, [marketEvents, client])

  //sub to events
  useEffect(() => {
    if (!isInitialized || !client) return

    const subscribeToEvents = async () => {
      try {
        // Subscribe to position events
        const positionListener = client.program.addEventListener(
          'marketEvent', // no position event, use market event instead
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (event: any) => {
            setRecentTrades((prev) => [
              {
                positionId: event.positionId?.toString?.() ?? String(event.positionId),
                mint: event.mint?.toString?.() ?? '',
                positionNonce: event.positionNonce?.toString?.() ?? String(event.positionNonce),
                marketId: event.marketId?.toString?.() ?? String(event.marketId),
                amount: event.amount?.toString?.() ?? String(event.amount),
                direction: event.direction,
                positionStatus: event.positionStatus,
                ts: event.ts?.toString?.() ?? String(event.ts),
                createdAt: event.createdAt?.toString?.() ?? String(event.createdAt),
              } as unknown as Position,
              ...prev,
            ])
          },
        )

        // Subscribe to market events
        const marketListener = client.program.addEventListener(
          'marketEvent',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (event: any) => {
            // console.log("=== MARKET EVENT RECEIVED ===");
            // console.log("Raw event:", event);
            // console.log("Event type:", typeof event);
            // console.log("Event keys:", Object.keys(event));
            // console.log("Market ID:", event.marketId?.toNumber());
            // console.log("Volume:", event.volume?.toNumber());
            // console.log("State:", event.marketState?.toString());
            // console.log("================================");

            setMarketEvents((prev) => {
              // Temporarily remove duplicate checking to debug
              // console.log(`Processing market event for market ${event.marketId.toNumber()} with volume ${event.volume.toNumber()}`);

              // Convert winningDirection from object format to enum
              let winningDirection: WinningDirection
              if (event.winningDirection && typeof event.winningDirection === 'object') {
                if ('yes' in event.winningDirection) {
                  winningDirection = WinningDirection.YES
                } else if ('no' in event.winningDirection) {
                  winningDirection = WinningDirection.NO
                } else if ('draw' in event.winningDirection) {
                  winningDirection = WinningDirection.DRAW
                } else if ('none' in event.winningDirection) {
                  winningDirection = WinningDirection.NONE
                } else {
                  winningDirection = WinningDirection.NONE
                }
              } else {
                winningDirection = event.winningDirection as WinningDirection
              }

              // console.log(`Adding market event for market ${event.marketId.toNumber()} with volume ${event.volume.toNumber()}`);

              return [
                {
                  marketId: event.marketId.toNumber(),
                  state: event.marketState.toString(),
                  yesLiquidity: event.yesLiquidity.toNumber(),
                  noLiquidity: event.noLiquidity.toNumber(),
                  volume: event.volume.toNumber(),
                  updateTs: event.updateTs.toNumber(),
                  nextPositionId: event.nextPositionId.toNumber(),
                  marketStart: event.marketStart.toNumber(),
                  marketEnd: event.marketEnd.toNumber(),
                  winningDirection: winningDirection,
                },
                ...prev,
              ]
            })
          },
        )

        setEventSubscriptions([positionListener, marketListener])
      } catch (error) {
        console.error('Error subscribing to events:', error)
        // Retry subscription after a delay
        setTimeout(() => {
          console.log('Retrying event subscription...')
          subscribeToEvents()
        }, 5000)
      }
    }

    subscribeToEvents()

    return () => {
      // Cleanup event listeners
      eventSubscriptions.forEach((subscriptionId) => {
        try {
          client.program.removeEventListener(subscriptionId)
        } catch (error) {
          console.error('Error unsubscribing from event:', error)
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, isInitialized])

  // --- SDK Methods ---

  // MARKET METHODS

  const fetchAllMarkets = async () => {
    setLoadingMarkets(true)
    try {
      const authority = new PublicKey(process.env.NEXT_PUBLIC_CREATOR_PUBLIC_ADMIN_KEY!)
      console.log('authority', authority)
      if (!authority) {
        console.log('error is thrown!')
        throw createShortxError(DepredictErrorType.INITIALIZATION, 'Missing creator pubkey during market fetching')
      }
      if (client) {
        const m = await client.trade.getMarketsByAuthority(authority)
        setMarkets(m || [])
      }
    } catch (err: unknown) {
      console.log('error', err)
      setDepredictError(createShortxError(DepredictErrorType.MARKET_FETCH, 'Unknown error', err))
      setMarkets([])
    } finally {
      setLoadingMarkets(false)
    }
  }

  const createMarket: ShortxContextType['createMarket'] = async (args) => {
    if (!client) throw createShortxError(DepredictErrorType.INITIALIZATION, 'SDK not initialized')
    try {
      const result = await client.trade.createMarket(args)
      return result
    } catch (err) {
      setDepredictError(createShortxError(DepredictErrorType.MARKET_CREATION, 'Failed to create market', err))
      return null
    }
  }

  const updateMarket: ShortxContextType['updateMarket'] = async (marketId, payer, marketEnd, marketState) => {
    if (!client) throw createShortxError(DepredictErrorType.INITIALIZATION, 'SDK not initialized')
    try {
      const ixs = await client.trade.updateMarket(marketId, payer, marketEnd, marketState)
      return ixs || null
    } catch (err) {
      setDepredictError(createShortxError(DepredictErrorType.MARKET_UPDATE, 'Failed to update market', err))
      return null
    }
  }

  const closeMarket: ShortxContextType['closeMarket'] = async (marketId, payer) => {
    if (!client) throw createShortxError(DepredictErrorType.INITIALIZATION, 'SDK not initialized')
    try {
      const ixs = await client.trade.closeMarket(marketId, payer)
      return ixs
    } catch (err) {
      setDepredictError(createShortxError(DepredictErrorType.MARKET_CLOSURE, 'Failed to close market', err))
      return null
    }
  }

  const resolveMarket: ShortxContextType['resolveMarket'] = async (args) => {
    if (!client) throw createShortxError(DepredictErrorType.INITIALIZATION, 'SDK not initialized')
    try {
      const ixs = await client.trade.resolveMarket(args)
      return ixs
    } catch (err) {
      setDepredictError(createShortxError(DepredictErrorType.MARKET_RESOLUTION, 'Failed to resolve market', err))
      return null
    }
  }

  const getAllPositionPagesForMarket: ShortxContextType['getAllPositionPagesForMarket'] = async (marketId) => {
    if (!client) throw createShortxError(DepredictErrorType.INITIALIZATION, 'SDK not initialized')
    try {
      const accounts = await client.position.getAllPositionPagesForMarket(marketId)
      return accounts
    } catch (err) {
      setDepredictError(createShortxError(DepredictErrorType.POSITION_FETCH, 'Failed to fetch positions', err))
      return null
    }
  }

  // POSITION METHODS
  const openPosition: ShortxContextType['openPosition'] = async (args) => {
    if (!client) throw createShortxError(DepredictErrorType.INITIALIZATION, 'SDK not initialized')
    try {
      const ixs = await client.trade.openPosition(args)
      return ixs
    } catch (err) {
      console.log('openPosition error', err)
      setDepredictError(createShortxError(DepredictErrorType.POSITION_OPENING, 'Failed to open position', err))
      throw err
    }
  }

  const payoutPosition: ShortxContextType['payoutPosition'] = async (args) => {
    if (!client) throw createShortxError(DepredictErrorType.INITIALIZATION, 'SDK not initialized')
    try {
      const tx = await client.trade.payoutPosition({
        marketId: args.marketId,
        payer: args.payer,
        assetId: args.assetId,
        rpcEndpoint: process.env.NEXT_PUBLIC_RPC_ENDPOINT!,
      })
      return tx
    } catch (err) {
      console.log('payoutPosition error', err)
      setDepredictError(createShortxError(DepredictErrorType.PAYOUT, 'Failed to payout position', err))
      return null
    }
  }

  // MARKET CREATOR METHODS
  const createMarketCreator = async () => {
    if (!client) throw createShortxError(DepredictErrorType.INITIALIZATION, 'SDK not initialized')
    try {
      const ixs = await client.marketCreator.createMarketCreator({
        name: 'Market Creator',
        feeVault: new PublicKey(process.env.CREATOR_PUBLIC_FEE_VAULT!),
        creatorFeeBps: 100,
        signer: new PublicKey(process.env.CREATOR_PUBLIC_ADMIN_KEY!),
      })
      return ixs
    } catch (err) {
      setDepredictError(createShortxError(DepredictErrorType.MARKET_CREATOR_CREATION, 'Failed to create market creator', err))
      return null
    }
  }

  const verifyMarketCreator = async (args: { signer: PublicKey; coreCollection: PublicKey; merkleTree: PublicKey }) => {
    if (!client) throw createShortxError(DepredictErrorType.INITIALIZATION, 'SDK not initialized')
    try {
      const ixs = await client.marketCreator.verifyMarketCreator(args)
      return ixs
    } catch (err) {
      setDepredictError(createShortxError(DepredictErrorType.MARKET_CREATOR_CREATION, 'Failed to verify market creator', err))
      return null
    }
  }

  const updateMarketCreatorName = async (args: { signer: PublicKey; newName: string }) => {
    if (!client) throw createShortxError(DepredictErrorType.INITIALIZATION, 'SDK not initialized')
    try {
      const ixs = await client.marketCreator.updateMarketCreatorName(args)
      return ixs
    } catch (err) {
      setDepredictError(
        createShortxError(DepredictErrorType.MARKET_CREATOR_CREATION, 'Failed to update market creator name', err),
      )
      return null
    }
  }

  const updateMarketCreatorFeeVault = async (args: {
    signer: PublicKey
    currentFeeVault: PublicKey
    newFeeVault: PublicKey
  }) => {
    if (!client) throw createShortxError(DepredictErrorType.INITIALIZATION, 'SDK not initialized')
    try {
      const ixs = await client.marketCreator.updateMarketCreatorFeeVault(args)
      return ixs
    } catch (err) {
      setDepredictError(
        createShortxError(DepredictErrorType.MARKET_CREATOR_CREATION, 'Failed to update market creator fee vault', err),
      )
      return null
    }
  }

  const updateMarketCreatorFee = async (args: { signer: PublicKey; creatorFeeBps: number }) => {
    if (!client) throw createShortxError(DepredictErrorType.INITIALIZATION, 'SDK not initialized')
    try {
      const ixs = await client.marketCreator.updateMarketCreatorFee(args)
      return ixs
    } catch (err) {
      setDepredictError(
        createShortxError(DepredictErrorType.MARKET_CREATOR_CREATION, 'Failed to update market creator fee', err),
      )
      return null
    }
  }

  const updateMerkleTree = async (args: { signer: PublicKey; newTree: PublicKey }) => {
    if (!client) throw createShortxError(DepredictErrorType.INITIALIZATION, 'SDK not initialized')
    try {
      const ixs = await client.marketCreator.updateMerkleTree(args)
      return ixs
    } catch (err) {
      setDepredictError(createShortxError(DepredictErrorType.MARKET_CREATOR_CREATION, 'Failed to update merkle tree', err))
      return null
    }
  }

  const updateMarketOptimistic = (marketId: string, updates: Partial<Market>) => {
    setMarkets((prevMarkets) => 
      prevMarkets.map((m) => 
        m.marketId === marketId 
          ? { ...m, ...updates } 
          : m
      )
    )
  }
  return (
    <ShortxContext.Provider
      value={{
        client,
        markets,
        loadingMarkets,
        error:depredictError,
        isInitialized,
        marketCreatorStatus,
        recentTrades,
        marketEvents,
        updateMarketOptimistic,
        refresh,
        openPosition,
        getAllPositionPagesForMarket,
        payoutPosition,
        createMarket,
        updateMarket,
        resolveMarket,
        closeMarket,
        createMarketCreator,
        verifyMarketCreator,
        updateMarketCreatorName,
        updateMarketCreatorFeeVault,
        updateMarketCreatorFee,
        updateMerkleTree,
      }}
    >
      {children}
    </ShortxContext.Provider>
  )
}

export function useShortx() {
  const ctx = useContext(ShortxContext)
  if (!ctx) throw new Error('useShortx must be used within a ShortxProvider')
  return ctx
}
