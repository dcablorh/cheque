'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  Smartphone,
  Coins,
  Send,
  ArrowRight,
  Lock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'sender' | 'recipient'>('sender');
  const [amountGhs, setAmountGhs] = useState(500);
  const [recipientName, setRecipientName] = useState('Kojo Mensah');
  const [recipientPhone, setRecipientPhone] = useState('+233 24 123 4567');
  const [momoNetwork, setMomoNetwork] = useState<'MTN' | 'TELECEL' | 'AIRTELTIGO'>('MTN');
  const [destType, setDestType] = useState<'MOMO' | 'USDC'>('MOMO');
  const [isRedeemed, setIsRedeemed] = useState(false);

  return (
    <main className="min-h-screen flex flex-col justify-between p-4 md:p-12 max-w-7xl mx-auto">
      {/* Top Navbar */}
      <header className="flex items-center justify-between py-4 border-b border-slate-800/80 mb-8">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-bold text-black text-xl shadow-lg shadow-emerald-500/20">
            ₵
          </div>
          <div>
            <h1 className="font-bold text-lg text-white tracking-tight flex items-center gap-2">
              Cheque <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-normal">Ghana</span>
            </h1>
            <p className="text-xs text-slate-400">Digital Cheques Settled on Stellar</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 border border-slate-700 text-slate-300">
            <span className="w-2 h-2 mr-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Stellar Testnet
          </span>
        </div>
      </header>

      {/* Hero Section */}
      <section className="text-center max-w-3xl mx-auto mb-10">
        <h2 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight leading-tight mb-4">
          Send money with a name and a <span className="text-emerald-400">WhatsApp number</span>.
        </h2>
        <p className="text-slate-400 text-sm md:text-base max-w-xl mx-auto">
          Sender answers <span className="text-slate-200 font-semibold">who</span>. Recipient answers <span className="text-slate-200 font-semibold">where</span>.
          Single redemption enforced on-chain via Soroban smart contracts.
        </p>

        {/* Tab switcher */}
        <div className="inline-flex p-1 bg-slate-900 border border-slate-800 rounded-xl mt-6 shadow-inner">
          <button
            onClick={() => setActiveTab('sender')}
            className={`px-6 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all ${
              activeTab === 'sender'
                ? 'bg-emerald-500 text-black shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sender Flow (Create & Fund)
          </button>
          <button
            onClick={() => setActiveTab('recipient')}
            className={`px-6 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all ${
              activeTab === 'recipient'
                ? 'bg-emerald-500 text-black shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Recipient Flow (Verify & Claim)
          </button>
        </div>
      </section>

      {/* Main Interactive Demo Container */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-12">
        {/* Left Column: Interactive Form */}
        <div className="lg:col-span-6 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
          {activeTab === 'sender' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="font-semibold text-white text-base flex items-center gap-2">
                  <Send className="w-4 h-4 text-emerald-400" /> Create Digital Cheque
                </h3>
                <span className="text-xs text-slate-500">Step 1 of 2</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Payee Full Name</label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Payee WhatsApp Number (Ghana)</label>
                <input
                  type="text"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-emerald-500/80 mt-1">✓ Validated: +233 24 XXX 4567</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Amount (GHS)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-sm text-slate-500 font-bold">₵</span>
                  <input
                    type="number"
                    value={amountGhs}
                    onChange={(e) => setAmountGhs(Number(e.target.value))}
                    min={5}
                    max={2000}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-7 pr-3 py-2 text-sm text-white font-semibold focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                  <span>Min: ₵5</span>
                  <span>Max: ₵2,000 (V1 cap)</span>
                </div>
              </div>

              <div className="pt-2">
                <label className="block text-xs font-medium text-slate-400 mb-2">Expiry Window</label>
                <div className="grid grid-cols-3 gap-2">
                  {['24 Hours', '48 Hours (Default)', '7 Days'].map((preset, idx) => (
                    <button
                      key={preset}
                      className={`text-xs py-1.5 rounded-lg border font-medium ${
                        idx === 1
                          ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-400'
                          : 'border-slate-800 bg-slate-950 text-slate-400'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl space-y-1 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Cheque Face Value:</span>
                  <span className="font-semibold text-white">₵{amountGhs.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Platform Fee (Sender Pays):</span>
                  <span className="font-semibold text-white">₵5.00</span>
                </div>
                <div className="flex justify-between text-slate-300 font-bold pt-1 border-t border-slate-800">
                  <span>Total to Fund:</span>
                  <span className="text-emerald-400">₵{(amountGhs + 5).toFixed(2)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="font-semibold text-white text-base flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-400" /> Recipient Claim Flow
                </h3>
                <span className="text-xs text-emerald-400 font-medium">OTP Verified ✓</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Select Payout Destination</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setDestType('MOMO')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      destType === 'MOMO'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white shadow-md'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    <Smartphone className="w-5 h-5 mb-1 text-emerald-400" />
                    <div className="font-semibold text-sm">Mobile Money</div>
                    <div className="text-[11px] text-slate-400">MTN / Telecel / AirtelTigo</div>
                  </button>

                  <button
                    onClick={() => setDestType('USDC')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      destType === 'USDC'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white shadow-md'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    <Coins className="w-5 h-5 mb-1 text-emerald-400" />
                    <div className="font-semibold text-sm">Stellar USDC</div>
                    <div className="text-[11px] text-slate-400">Direct to wallet</div>
                  </button>
                </div>
              </div>

              {destType === 'MOMO' ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {(['MTN', 'TELECEL', 'AIRTELTIGO'] as const).map((net) => (
                      <button
                        key={net}
                        onClick={() => setMomoNetwork(net)}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border ${
                          momoNetwork === net
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        {net}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Mobile Money Number</label>
                    <input
                      type="text"
                      defaultValue="+233 24 123 4567"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Informational Name-Lookup Banner (Rule 6) */}
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                      <AlertTriangle className="w-4 h-4 text-amber-400" /> Informational Name Verification
                    </div>
                    <p className="text-slate-300">
                      Registered name on {momoNetwork}: <span className="font-bold text-white">KOJO MENSAH</span>
                    </p>
                    <p className="text-[11px] text-slate-400">
                      (Informational only — payouts are NEVER blocked if names differ. Requires explicit confirmation).
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Stellar Public Address (G...)</label>
                    <input
                      type="text"
                      placeholder="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-400 flex items-center justify-between">
                    <span>USDC Trustline Status:</span>
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                    </span>
                  </div>
                </div>
              )}

              <button
                onClick={() => setIsRedeemed(true)}
                disabled={isRedeemed}
                className="w-full mt-3 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-bold text-sm hover:opacity-95 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
              >
                {isRedeemed ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Cheque Redeemed Successfully
                  </>
                ) : (
                  <>
                    Get my ₵{amountGhs.toFixed(2)} <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Physical Digital Cheque Rendering */}
        <div className="lg:col-span-6 flex flex-col items-center">
          <div className="w-full max-w-md bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 border border-emerald-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden backdrop-blur-md">
            {/* Watermark badge */}
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-emerald-500/5 rounded-full pointer-events-none blur-2xl"></div>

            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-[10px] tracking-widest uppercase font-bold text-emerald-400">GHANA DIGITAL CHEQUE</span>
                <div className="text-xs text-slate-400 font-mono">SERIES 2026 • SOROBAN ESCROW</div>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono font-bold text-slate-300">CHQ-82F91K</span>
                <div className="text-[10px] text-slate-500">Public Display Code</div>
              </div>
            </div>

            <div className="space-y-4 my-6">
              <div>
                <div className="text-[11px] text-slate-500 uppercase tracking-wider">Pay to the order of</div>
                <div className="text-xl font-bold text-white tracking-wide border-b border-slate-800 pb-1 flex justify-between items-end">
                  <span>{activeTab === 'recipient' && !isRedeemed ? 'K**** M*****' : recipientName}</span>
                  <span className="text-xs font-mono text-emerald-400">
                    {recipientPhone.replace(/(\+233)(\d{2})\d{3}(\d{4})/, '$1 $2 XXX $3')}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center bg-slate-950/90 border border-slate-800/80 rounded-xl p-3">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Face Value</div>
                  <div className="text-2xl font-black text-emerald-400">₵{amountGhs.toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-500 uppercase">Stellar Settlement</div>
                  <div className="text-sm font-bold text-slate-300">~{((amountGhs / 15.5)).toFixed(2)} USDC</div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {Math.round((amountGhs / 15.5) * 10000000).toLocaleString()} stroops
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-end pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 font-mono">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <Lock className="w-3.5 h-3.5" />
                <span>Single-Redemption Locked</span>
              </div>
              <div className="text-right">
                <span className={isRedeemed ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                  STATUS: {isRedeemed ? 'SETTLED' : 'ACTIVE'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick specs pill */}
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            <span className="text-[11px] bg-slate-900 border border-slate-800 px-3 py-1 rounded-full text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Atomic Conditional UPDATE
            </span>
            <span className="text-[11px] bg-slate-900 border border-slate-800 px-3 py-1 rounded-full text-slate-400 flex items-center gap-1">
              <Coins className="w-3.5 h-3.5 text-emerald-400" /> Integer Minor Units (Pesewas)
            </span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 pt-6 text-center text-xs text-slate-500">
        Digital Cheques for Ghana • Built on Stellar & Soroban • SeevCash Ghana MoMo On/Off-Ramp
      </footer>
    </main>
  );
}
