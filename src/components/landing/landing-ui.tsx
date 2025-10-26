'use client'

import React from 'react'
import { Trophy, Shield } from 'lucide-react'
import { MarketsSection } from '@/components/ui/market-section'

export default function PredictionMarketLanding() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/20 text-white">
      {/* Animated background elements */}
      {/* <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-30">
        <div className="absolute top-20 left-20 w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
        <div className="absolute top-40 right-32 w-1 h-1 bg-green-400 rounded-full animate-pulse delay-75"></div>
        <div className="absolute bottom-32 left-1/4 w-1.5 h-1.5 bg-teal-400 rounded-full animate-pulse delay-150"></div>
        <div className="absolute top-1/3 right-1/4 w-1 h-1 bg-emerald-400 rounded-full animate-pulse delay-300"></div>
      </div> */}

      {/* Markets Section */}
      <MarketsSection />

      {/* Footer */}
      <footer className="relative border-t border-emerald-900/20 mt-20 bg-slate-950/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            {/* Branding */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-green-500 rounded-lg flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold text-lg">SportsBet</span>
              </div>
              <p className="text-sm text-slate-400 mb-4">
                Decentralized sports betting powered by blockchain technology. Bet on football, cricket, and more.
              </p>
              <div className="flex items-center gap-2 text-xs text-emerald-400/70">
                <Shield className="w-4 h-4" />
                <span>Provably Fair • Transparent • Secure</span>
              </div>
            </div>

            {/* Sports */}
            <div>
              <h4 className="font-semibold mb-3 text-emerald-400">Popular Sports</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="hover:text-emerald-400 transition-colors cursor-pointer">⚽ Football</li>
                <li className="hover:text-emerald-400 transition-colors cursor-pointer">🏏 Cricket</li>
                <li className="hover:text-emerald-400 transition-colors cursor-pointer">🏀 Basketball</li>
                <li className="hover:text-emerald-400 transition-colors cursor-pointer">🎾 Tennis</li>
              </ul>
            </div>

            {/* Info */}
            <div>
              <h4 className="font-semibold mb-3 text-emerald-400">Blockchain Powered</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>Built on Solana</li>
                <li>Instant settlements</li>
                <li>Low fees</li>
                <li>Transparent odds</li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-800/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-slate-500">
              © 2025 SportsBet. Built with Next.js & Solana
            </p>
            <p className="text-xs text-slate-600">
              Bet responsibly. Must be 18+ to participate.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
