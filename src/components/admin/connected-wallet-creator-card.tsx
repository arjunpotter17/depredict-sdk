import { AdminWalletCreator } from '@/hooks/use-admin-wallet-creator'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'

export default function ConnectedWalletCreatorCard({
  marketCreator,
}: {
  marketCreator: AdminWalletCreator
}) {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied!`)
  }

  if (!marketCreator) return null

  return (
    <div className="mb-8 p-6 rounded-2xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20">
      <h2 className="text-2xl font-bold mb-4">Market Creator Found</h2>
      <p className="text-slate-300 mb-4">
        Your connected wallet is the authority for this market creator. Add these to your `.env.local`:
      </p>

      <div className="space-y-3">
        <div className="bg-slate-800/50 p-4 rounded-xl border border-purple-500/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-purple-400">NEXT_PUBLIC_CREATOR_PUBLIC_ADMIN_KEY</span>
            <button
              onClick={() => copyToClipboard(marketCreator.pda, 'Market Creator PDA')}
              className="p-1 hover:bg-purple-500/20 rounded transition-colors"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <code className="text-xs text-slate-300 font-mono">{marketCreator.pda}</code>
        </div>

        <div className="bg-slate-800/50 p-4 rounded-xl border border-purple-500/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-purple-400">NEXT_PUBLIC_SHORTX_COLLECTION_ADDRESS</span>
            <button
              onClick={() => copyToClipboard(marketCreator.coreCollection, 'Core Collection')}
              className="p-1 hover:bg-purple-500/20 rounded transition-colors"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <code className="text-xs text-slate-300 font-mono">{marketCreator.coreCollection}</code>
        </div>

        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-400">Merkle Tree</span>
            <button
              onClick={() => copyToClipboard(marketCreator.merkleTree, 'Merkle Tree')}
              className="p-1 hover:bg-slate-500/20 rounded transition-colors"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <code className="text-xs text-slate-300 font-mono">{marketCreator.merkleTree}</code>
        </div>

        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-400">Authority (Your Wallet)</span>
            <button
              onClick={() => copyToClipboard(marketCreator.authority, 'Authority')}
              className="p-1 hover:bg-slate-500/20 rounded transition-colors"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <code className="text-xs text-slate-300 font-mono">{marketCreator.authority}</code>
        </div>
      </div>

      <div className="mt-4 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
        <p className="text-sm text-blue-300">
          💡 After adding these to your `.env.local`, restart the dev server to apply changes.
        </p>
      </div>
    </div>
  )
}
