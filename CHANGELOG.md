# Changelog

All notable changes to the Algorand Portfolio Tracker are documented in this file.

## [Unreleased]

### Added
- Light/dark mode toggle using `next-themes` with Tailwind `darkMode: "class"` strategy (2026-02-17)
  - Theme toggle button (sun/moon icons) in dashboard header and Settings tab
  - All pages converted to dual-mode: landing, dashboard, wallets, auth buttons
  - Preference persists in localStorage; defaults to dark; respects OS `prefers-color-scheme`
  - No flash of wrong theme on page load via `next-themes` inline script
- Wallet deletion flow: secure `DELETE /api/wallets/[walletId]` endpoint plus Wallet Linking UI "Remove" action so users can unlink wallets after adding them (2026-02-17 04:46 MST)
- Unit test coverage for wallet deletion ownership/404 rules via a dedicated deletion service (`tests/wallet-delete.test.ts`) (2026-02-17 04:46 MST)

### Changed
- Complete rewrite of README.md with architecture diagram, annotated project structure, environment variable tables, expanded feature descriptions, and security documentation
- Added this CHANGELOG.md
- Hardened rate limiting with persistent audit-log-backed checks (with in-memory fallback on transient DB failures), and switched API routes to async rate-limit enforcement (2026-02-17 04:36 MST)
- Corrected per-wallet FIFO attribution to include inbound acquisition lots (receiver-side events), fixing wallet-level cost basis/PnL accuracy (2026-02-17 04:36 MST)

### Fixed
- Disabled NextAuth debug logging in production even if `NEXTAUTH_DEBUG=true`, preventing sensitive auth/provider internals from being written to production logs (2026-02-17 04:36 MST)
- Added `*.tsbuildinfo` to `.gitignore` and untracked committed `tsconfig.tsbuildinfo` build artifact (2026-02-17 04:36 MST)
- Added regression tests for wallet-level inbound FIFO attribution and rate-limit behavior (allow/block + fallback path) (2026-02-17 04:36 MST)

## [0.1.0] - 2026-02-16

### Added
- Pera WalletConnect session handling: detect existing sessions and allow forced disconnect before reconnecting, preventing "session already connected" errors (`f292bf5`)
- Multi-account wallet selector: when Pera returns multiple accounts, a dropdown lets the user choose which address to link (`f4c5e26`)
- DeFi Positions tab revamped with Beefy-style yield table showing at-deposit value, current value, yield, PnL, APR, and daily yield estimates (`cd1a09f`)
- Built-in ASA-to-CoinGecko price mappings for USDC, USDt, goBTC, goETH, gALGO, tALGO, xALGO; extensible via `ASA_PRICE_MAP_JSON` env var (`6e6a2ef`)
- FIFO lot engine hardened: skip zero/invalid quantities and non-finite costs to prevent NaN propagation (`6e6a2ef`)

### Fixed
- Removed accidental duplicate `' 2'` source directories created during initial import (`bdb659a`)

## [0.0.1] - 2026-02-15

### Added
- Initial project scaffold with Next.js 14 App Router and TypeScript
- Google OAuth authentication via NextAuth with Prisma adapter
- Wallet linking with on-chain note-transaction verification (Pera sign-and-submit + manual txId fallback)
- Algorand Indexer client for account state, balances, and transaction history with inner-transaction flattening
- Algod client for suggested params and transaction submission
- FIFO cost basis engine with fee capitalization policy
- Transaction parser converting payment and ASA transfers into buy/sell lot events
- Portfolio snapshot computation: consolidated balances, cost basis, realized/unrealized PnL, per-wallet breakdown
- CoinGecko spot price integration for ALGO and mapped ASAs
- DeFi adapter layer with detection stubs for Tinyman (LP), Folks Finance (lending), and Reti (staking)
- Dashboard with Overview, Transactions, DeFi Positions, Wallets, and Settings tabs
- Privacy mode to mask dollar amounts
- Hide zero-balance tokens filter
- Snapshot persistence to PostgreSQL with on-demand refresh
- Same-origin request validation on mutating API endpoints
- Per-user + per-IP in-memory rate limiting
- Audit logging for wallet link, verification, and portfolio refresh events
- Zod-validated environment configuration with sensible defaults
- NextAuth middleware protecting `/dashboard` and `/wallets` routes
- Prisma schema with User, LinkedWallet, WalletVerificationChallenge, PortfolioSnapshot, and AuditLog models
- Unit tests for FIFO lot engine (buy/sell, price gaps, fee policy)
- Integration-style snapshot test with dependency injection
- Deployment guide for Vercel + Neon/Supabase (`docs/DEPLOYMENT.md`)
