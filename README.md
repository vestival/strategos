# Algorand Portfolio Tracker (MVP)

## Stack
- Next.js 14 (App Router, TypeScript)
- Tailwind CSS
- NextAuth (Google OAuth)
- PostgreSQL + Prisma
- TanStack Query
- Zod

## Features
- Google sign-in
- Link multiple Algorand wallet addresses
- Wallet ownership verification with note transaction challenge
- Wallet ownership verification via Pera wallet sign-and-send (with manual txId fallback)
- Consolidated balances (ALGO + ASAs)
- FIFO cost basis + realized/unrealized PnL (best effort)
- DeFi adapter layer for Tinyman, Folks Finance, Reti
- Snapshot persistence + on-demand refresh
- Basic audit logging and API rate limiting

## Setup
1. Install deps:
   - `npm install`
2. Copy env file:
   - `cp .env.example .env`
3. Run migrations:
   - `npx prisma migrate dev --name init`
4. Start dev server:
   - `npm run dev`

## Required environment variables
- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ALGORAND_INDEXER_URL`
- `ALGORAND_ALGOD_URL`
- `ALGORAND_VERIFICATION_RECEIVER`

Optional:
- `ALGORAND_INDEXER_TOKEN`
- `ALGORAND_ALGOD_TOKEN`
- `PRICE_API_URL`
- `ASA_PRICE_MAP_JSON`
  - Optional overrides/additions for ASA -> CoinGecko ID mapping.
  - Built-in defaults already cover common assets (USDC, USDt, goBTC, goETH, gALGO, tALGO, xALGO).
- `TINYMAN_APP_IDS`
- `FOLKS_APP_IDS`
- `RETI_APP_IDS`
- `PUBLIC_RATE_LIMIT_WINDOW_MS`
- `PUBLIC_RATE_LIMIT_MAX`
- `INDEXER_TX_LIMIT`

## Verification flow (wallet ownership)
This MVP uses nonce note-transaction verification:
1. User starts wallet link with address.
2. Backend generates nonce, note, and unsigned verification transaction.
3. Preferred path: user signs in Pera WalletConnect and app submits signed transaction.
4. Fallback path: user sends manually and submits txId.
5. Backend validates sender + receiver + nonce note and marks wallet verified.

## Accounting policy
- Cost basis method: FIFO
- Fee treatment: fees are capitalized into acquisition cost on buys and subtracted from proceeds on disposals
- Missing price handling: asset shows balance/value as available, flagged as `no price`, excluded from PnL totals
- Historical pricing: currently best-effort (uses available spot price fallback); marked as estimated in UI

## Deploy to Vercel
1. Create Postgres database (Neon/Supabase).
2. Add env vars in Vercel project settings.
3. Run Prisma migration in CI or manually:
   - `npx prisma migrate deploy`
4. Deploy:
   - `vercel --prod`

Detailed deployment and environment documentation:
- `docs/DEPLOYMENT.md`

## Tests
- Unit FIFO tests: `npm run test -- tests/lots.test.ts`
- Integration-like snapshot test: `npm run test -- tests/snapshot.test.ts`

## Known limitations / next steps
- Swap parsing can be improved using group-level transaction decoding.
- Historical price sources for ASAs are limited.
- DeFi position valuation currently detects protocol presence and basic state; deeper decoding is TODO.
- WalletConnect message-sign verification can be added as a higher UX option.
