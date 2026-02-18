# Algorand Portfolio Tracker

Production-ready MVP for Algorand portfolio tracking with Google login, multi-wallet linking, FIFO cost basis, transaction analytics, and DeFi estimates.

## What it does

- Google OAuth sign-in (NextAuth + Prisma adapter)
- Link and verify multiple Algorand wallets (Pera Wallet flow + on-chain nonce note verification)
- Consolidated balances across wallets (ALGO + ASAs)
- FIFO cost basis and unrealized PnL
- Transaction table with filtering/search and explorer links
- Historical portfolio charts:
  - Overview: aggregate transaction-based history
  - Wallet Analytics tab: aggregate/per-wallet lines
  - Metric toggle: `Total value (USD)` or `Token balance`
  - Range toggle: `7D / 30D / 90D / Max`
- DeFi positions (Tinyman/Folks/Reti adapter layer, best-effort detection)
- EN/ES language switch, dark/light mode, privacy hide-amounts mode
- User self-service account deletion from Settings

## Current accounting behavior

- Cost basis method: FIFO only.
- Fee policy:
  - Buy: fee capitalized into lot cost.
  - Sell: fee deducted from proceeds.
- Lot accounting uses **historical tx-date prices only**.
- Transaction display values can fall back to spot price if historical is missing, but FIFO lot cost basis does not use this fallback.
- Assets without pricing are shown as balances with `no price` and excluded from priced totals.

## Stack

- Next.js 14 (App Router, TypeScript)
- Tailwind CSS
- NextAuth v4
- Prisma + PostgreSQL (Neon/Supabase compatible)
- TanStack Query
- Zod
- algosdk + Algorand Indexer/Algod
- Vitest

## High-level architecture

```
Client (Next.js app)
  ├── /                 Landing + Google sign-in
  ├── /dashboard        Overview / Transactions / DeFi / Wallet Analytics / Settings
  └── /wallets          Pera connect + wallet verification + wallet removal

API (route handlers, auth-guarded)
  ├── /api/auth/[...nextauth]
  ├── /api/wallets/link
  ├── /api/wallets/verify
  ├── /api/wallets/list
  ├── /api/wallets/[walletId]   DELETE
  ├── /api/portfolio/refresh
  ├── /api/portfolio/snapshot
  ├── /api/portfolio/history
  └── /api/account              DELETE

Core services
  ├── Indexer fetch + tx parsing
  ├── FIFO lot engine
  ├── Snapshot compute + persistence
  ├── Wallet analytics series builder
  ├── DeFi adapter aggregator
  └── Security: same-origin checks + rate limiting + audit logs
```

## Key folders

```
src/
  app/
    api/
      account/route.ts
      auth/[...nextauth]/route.ts
      portfolio/{refresh,snapshot,history}/route.ts
      wallets/{link,list,verify}/route.ts
      wallets/[walletId]/route.ts
    dashboard/page.tsx
    wallets/page.tsx
  components/
    auth-buttons.tsx
    dashboard/dashboard-client.tsx
  lib/
    algorand/
    defi/
    portfolio/
      lots.ts
      parser.ts
      snapshot.ts
      history.ts
      wallet-analytics.ts
    price/provider.ts
    auth.ts
    env.ts
    rate-limit.ts
tests/
```

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Google OAuth credentials
- Algorand indexer/algod endpoints

### Local run

```bash
npm install
cp .env.example .env.local
npx prisma db push
npm run dev
```

## Environment variables

### Required

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ALGORAND_INDEXER_URL`
- `ALGORAND_VERIFICATION_RECEIVER`

### Common optional

- `ALGORAND_INDEXER_TOKEN`
- `ALGORAND_ALGOD_URL`
- `ALGORAND_ALGOD_TOKEN`
- `PRICE_API_URL`
- `DEFI_LLAMA_PRICE_API_URL`
- `ASA_PRICE_MAP_JSON`
- `TINYMAN_APP_IDS`
- `FOLKS_APP_IDS`
- `RETI_APP_IDS`
- `PUBLIC_RATE_LIMIT_WINDOW_MS`
- `PUBLIC_RATE_LIMIT_MAX`
- `INDEXER_TX_LIMIT`
- `NEXTAUTH_DEBUG`

## Security notes

- No private keys or seed phrases are stored.
- Wallet ownership is verified on-chain.
- Mutating routes enforce same-origin checks.
- Public APIs are rate-limited.
- Account deletion removes user-linked data via relational cascade.

## Tests and build

```bash
npm test
npm run build
```

## Deployment (Vercel)

1. Set all required env vars in Vercel project.
2. Ensure Google OAuth redirect URI:
   - `https://<your-domain>/api/auth/callback/google`
3. Deploy:

```bash
vercel --prod
```

4. Initialize database schema (first deploy):

```bash
npx prisma db push
```

Detailed runbook: `docs/DEPLOYMENT.md`.

## Known limitations

- DeFi adapters are intentionally best-effort and extensible.
- Historical pricing coverage depends on mappings/data availability.
- FIFO only (average-cost mode not implemented).
- Realized PnL summary card is intentionally hidden in top dashboard cards for now.
