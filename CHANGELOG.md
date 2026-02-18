# Changelog

All notable changes to Strategos are documented in this file.

## [Unreleased]

### Added
- Strategos brand system documentation with identity standards, tone, typography, and color tokens in `docs/BRANDING.md` (2026-02-18 06:27 MST)
- Legal pages with EN/ES localized content: `/privacy` and `/terms`, including dynamic last-updated date and support email placeholder sourced from environment configuration (2026-02-18 06:27 MST)
- Global footer with Strategos identity, legal links, and current-year copyright on all app pages (2026-02-18 06:27 MST)
- JSON-based locale dictionaries at `locales/en.json` and `locales/es.json` for structured i18n coverage (2026-02-18 06:27 MST)
- New Wallet Analytics tab with wallet multi-select dropdown, metric selector (`Total value (USD)` / `Token balance`), chart mode selector (`Aggregate` / `Per wallet`), and asset selector for balance visualization (2026-02-17 11:02 MST)
- Interactive multi-line wallet chart with hover/touch crosshair, per-series tooltip values, and range filters (7D/30D/90D/Max) (2026-02-17 11:02 MST)
- Wallet analytics series utilities and tests for per-wallet replay, ALGO fee impact on balance mode, and aligned aggregate series generation (`src/lib/portfolio/wallet-analytics.ts`, `tests/wallet-analytics.test.ts`) (2026-02-17 11:02 MST)
- Portfolio history chart is now interactive (hover/touch crosshair + tooltip with exact point value/date) for easier historical inspection (2026-02-17 10:20 MST)
- Historical portfolio chart on Overview backed by transaction history replay (`/api/portfolio/history`) with 7D/30D/90D/Max range filters and change summary metrics (2026-02-17 10:20 MST)
- Portfolio history extraction utility with regression tests for sorting, invalid-row filtering, and same-day deduplication (`src/lib/portfolio/history.ts`, `tests/history.test.ts`) (2026-02-17 10:20 MST)
- User menu now includes a direct `Settings` shortcut (`/dashboard?tab=settings`) so preferences and danger-zone actions are accessible from account controls (2026-02-17 09:02 MST)
- Self-service account deletion in Settings via secure `DELETE /api/account` endpoint plus UI danger-zone action (with confirmation), cascading removal of linked wallets/snapshots/sessions through Prisma relations (2026-02-17 09:06 MST)
- Unit tests for account deletion service covering success and missing-user behavior (`tests/account-delete.test.ts`) (2026-02-17 09:06 MST)
- UX redesign of dashboard top bar: compact control cluster with eye privacy toggle, streamlined language switch, and cleaner spacing to reduce action overload (2026-02-17 08:40 MST)
- New account dropdown menu (email, manage wallets, sign out) replacing the prior always-visible user/email/sign-out row in dashboard header (2026-02-17 08:40 MST)
- Settings tab now includes a dedicated wallet management section with CTA to open `/wallets` (2026-02-17 08:40 MST)
- Overview assets are now expandable: clicking an asset row reveals per-wallet holdings for that specific asset (wallet address, balance, and current USD value) (2026-02-17 08:13 MST)
- Snapshot payload now includes `walletBreakdown` per asset so wallet-level allocation is computed server-side and persists in cached snapshots (2026-02-17 08:13 MST)
- Added snapshot regression test to validate per-asset wallet breakdown output (`tests/snapshot.test.ts`) (2026-02-17 08:13 MST)
- EN/ES language switching with persistent preference (`localStorage`) via global `LanguageProvider` and `LanguageToggle` controls (2026-02-17 06:41 MST)
- Bilingual UI coverage for landing page, dashboard, auth buttons, and wallet linking flow (2026-02-17 06:41 MST)
- Basic i18n regression tests for dictionary presence and translated tab labels (`tests/i18n.test.ts`) (2026-02-17 06:41 MST)
- Light/dark mode toggle using `next-themes` with Tailwind `darkMode: "class"` strategy (2026-02-17)
  - Theme toggle button (sun/moon icons) in dashboard header and Settings tab
  - All pages converted to dual-mode: landing, dashboard, wallets, auth buttons
  - Preference persists in localStorage; defaults to dark; respects OS `prefers-color-scheme`
  - No flash of wrong theme on page load via `next-themes` inline script
- Wallet deletion flow: secure `DELETE /api/wallets/[walletId]` endpoint plus Wallet Linking UI "Remove" action so users can unlink wallets after adding them (2026-02-17 04:46 MST)
- Unit test coverage for wallet deletion ownership/404 rules via a dedicated deletion service (`tests/wallet-delete.test.ts`) (2026-02-17 04:46 MST)

### Changed
- Rebranded application identity from prior naming to **Strategos** across metadata, package naming, and documentation titles (2026-02-18 06:27 MST)
- Updated metadata canonical/Open Graph base URL handling using `NEXT_PUBLIC_BASE_URL` (default `https://strategos.vestival.es`) for custom-domain readiness on Vercel (2026-02-18 06:27 MST)
- Updated typography and visual system to institutional dark-first defaults: Cinzel for brand headings and Inter for UI text (2026-02-18 06:27 MST)
- README fully refreshed to match current shipped behavior: wallet analytics tab, transaction-based historical charting, account deletion, i18n/theme/privacy controls, and FIFO historical-pricing rules (2026-02-17 19:37 MST)
- Complete rewrite of README.md with architecture diagram, annotated project structure, environment variable tables, expanded feature descriptions, and security documentation
- Added this CHANGELOG.md
- Hardened rate limiting with persistent audit-log-backed checks (with in-memory fallback on transient DB failures), and switched API routes to async rate-limit enforcement (2026-02-17 04:36 MST)
- Corrected per-wallet FIFO attribution to include inbound acquisition lots (receiver-side events), fixing wallet-level cost basis/PnL accuracy (2026-02-17 04:36 MST)

### Fixed
- Fixed portfolio history asset-state mapping bug in `/api/portfolio/history`: snapshot `assets` were incorrectly read as `assetId` (non-existent) instead of `assetKey`, which collapsed holdings into ALGO and produced false chart deltas; now mapped correctly by `assetKey` (`src/app/api/portfolio/history/route.ts`) (2026-02-18 20:25 MST)
- Added mapping utility + regression test to ensure latest snapshot asset keys are preserved for historical replay (`src/lib/portfolio/history-mapper.ts`, `tests/history-mapper.test.ts`) (2026-02-18 20:25 MST)
- Portfolio history no longer collapses to one point per day; it now preserves point resolution per timestamp so trend changes reflect actual event timing (`src/lib/portfolio/history.ts`) (2026-02-18 20:17 MST)
- Prevented latest anchor overwrite when a transaction shares the same timestamp as snapshot `computedAt`, avoiding false chart jumps to near-zero values (`src/lib/portfolio/history.ts`) (2026-02-18 20:17 MST)
- Added regression coverage for same-timestamp anchor protection in portfolio history (`tests/history.test.ts`) (2026-02-18 20:17 MST)
- Portfolio history chart now anchors replay to the latest snapshot asset balances/prices and replays backwards, preventing exaggerated historical jumps caused by incomplete older transaction windows (`src/lib/portfolio/history.ts`, `src/app/api/portfolio/history/route.ts`) (2026-02-18 20:09 MST)
- Added regression coverage for latest-anchor historical replay stability (`tests/history.test.ts`) (2026-02-18 20:09 MST)
- Added multi-provider spot pricing fallback chain: configured `PRICE_API_URL` -> default CoinGecko -> DefiLlama, reducing `no price` outages when one provider is unavailable (`src/lib/price/provider.ts`) (2026-02-18 20:03 MST)
- Added last-known-good spot cache reuse across providers so previously fetched prices are retained during transient API failures (`src/lib/price/provider.ts`) (2026-02-18 20:03 MST)
- Added regression coverage for DefiLlama fallback path in price provider tests (`tests/price-provider.test.ts`) (2026-02-18 20:03 MST)
- Spot price fetching is now resilient: if `PRICE_API_URL` fails or returns empty data, the app retries against CoinGecko default endpoint and falls back to last known good cached prices to avoid showing `no price` for all assets during transient outages (`src/lib/price/provider.ts`) (2026-02-18 19:58 MST)
- Added regression tests for price-provider fallback and cached-price recovery on endpoint failures (`tests/price-provider.test.ts`) (2026-02-18 19:58 MST)
- FIFO cost basis no longer drifts with refresh-only spot price moves: lot accounting now uses historical acquisition-time prices only (no spot fallback in parser/FIFO path), while transaction display still falls back to spot when needed (2026-02-17 19:31 MST)
- Added regression test to ensure changing spot price does not mutate FIFO remaining cost basis when historical tx-date price is unavailable (`tests/snapshot.test.ts`) (2026-02-17 19:31 MST)
- Portfolio history data source now replays historical transactions from the latest snapshot payload (instead of sparse snapshot-only points), producing denser and transaction-grounded historical series (2026-02-17 10:20 MST)
- Simplified dashboard navigation by removing redundant `Wallets` and `Settings` tabs and moving the primary tab strip (`Overview/Transactions/DeFi`) to the top section for cleaner IA and less visual clutter (2026-02-17 09:02 MST)
- Snapshot API now auto-recomputes when legacy asset rows are missing `walletBreakdown`, so expanded asset rows reliably show wallet-level ownership after deployment updates (2026-02-17 08:28 MST)
- Overview asset expansion now tolerates older cached snapshots that don't include `walletBreakdown`, preventing client-side crashes when clicking an asset row before refresh (2026-02-17 08:22 MST)
- Wallet deletion now clears cached portfolio snapshots for the user after unlinking, so removed-wallet transactions/metrics are not retained in dashboard cached data (2026-02-17 06:25 MST)
- Added deletion regression coverage to ensure cache purge runs only on successful owner deletion, and never on 403/404 paths (`tests/wallet-delete.test.ts`) (2026-02-17 06:25 MST)
- Transactions table now labels token IDs explicitly as `ASA <id>` below the symbol (instead of a bare number), clarifying why IDs appear for ASA assets (2026-02-17 06:16 MST)
- Transactions `Price` now renders with higher precision (3-6 decimals) for small values so source pricing can be validated more easily (2026-02-17 06:16 MST)
- Transactions `Fee` now shows native ALGO fee with at least 3 decimals (plus precise USD secondary line), matching on-chain fee readability (2026-02-17 06:16 MST)
- Disabled NextAuth debug logging in production even if `NEXTAUTH_DEBUG=true`, preventing sensitive auth/provider internals from being written to production logs (2026-02-17 04:36 MST)
- Added `*.tsbuildinfo` to `.gitignore` and untracked committed `tsconfig.tsbuildinfo` build artifact (2026-02-17 04:36 MST)
- Added regression tests for wallet-level inbound FIFO attribution and rate-limit behavior (allow/block + fallback path) (2026-02-17 04:36 MST)
- Stabilized portfolio numeric outputs by sanitizing invalid math inputs in snapshot computation, preventing `null`/`NaN` cost basis and PnL cards after persistence (2026-02-17 04:57 MST)
- Snapshot API now auto-recomputes when stored totals/asset cost basis fields are invalid, not only when transactions are empty (2026-02-17 04:57 MST)
- `formatUsd` now rejects all non-finite numbers (`NaN`, `Infinity`) to avoid broken currency rendering (2026-02-17 04:57 MST)
- Added regression test ensuring malformed transaction fields cannot break cost basis/PnL displayability (`tests/snapshot.test.ts`) (2026-02-17 04:57 MST)
- Fixed FIFO realized PnL overstatement when disposal quantity exceeds known lots; unmatched quantity is now treated as missing history instead of zero-cost profit (`src/lib/portfolio/lots.ts`) (2026-02-17 05:11 MST)
- Portfolio asset cost basis is now reconciled against current on-chain balance; zero-balance assets default to zero remaining basis to avoid confusing carryover values (2026-02-17 05:11 MST)
- Overview now defaults to hiding 0-balance assets to reduce noise from opt-ins and stale holdings (2026-02-17 05:11 MST)
- Added "Prices as of" timestamp with local timezone in the dashboard footer for pricing transparency (2026-02-17 05:11 MST)
- Added FIFO regression test for partial-lot disposal and snapshot assertion for `priceAsOf` metadata (2026-02-17 05:11 MST)
- Fixed Indexer timestamp parsing by honoring `round-time` fallback, eliminating 1969 transaction dates in UI when `confirmed-round-time` is absent (2026-02-17 05:20 MST)
- Transactions and FIFO cost basis now use historical per-day USD prices (CoinGecko history for mapped assets) instead of current spot-only pricing (2026-02-17 05:20 MST)
- Removed the forced fallback of `cost basis = current value`; cost basis now comes from dated transaction lots, preventing artificial zero unrealized PnL (2026-02-17 05:20 MST)
- Improved amount formatting precision (up to 6 decimals) so small transfers no longer display as zero (2026-02-17 05:20 MST)
- Added regression test for historical tx-date pricing to validate transaction value and cost basis behavior (`tests/snapshot.test.ts`) (2026-02-17 05:20 MST)
- Snapshot API now auto-recomputes when cached transactions contain invalid timestamps (`ts <= 0`) so stale 1969-era rows are replaced by fresh indexer data (2026-02-17 05:27 MST)
- Transactions table time renderer now shows `unknown` for invalid timestamps instead of misleading `12/31/1969` fallback dates (2026-02-17 05:27 MST)
- Fixed transaction valuation fallback: when historical price lookup returns `null` for a date, snapshot now falls back to current spot price instead of leaving tx `Value` empty (2026-02-17 05:34 MST)
- Added regression test for historical-price-null fallback to spot valuation (`tests/snapshot.test.ts`) (2026-02-17 05:34 MST)
- Snapshot invalidation now also refreshes automatically when a priced-asset transaction has missing `Value`, preventing stale blank value rows from persisting (2026-02-17 05:44 MST)
- Transaction rows now carry explicit `valueSource` metadata (`historical`/`spot`/`missing`) and display an `est.` label when spot fallback is used (2026-02-17 05:44 MST)
- Zero-amount transactions now explicitly render `$0.00` value instead of blank fallback behavior (2026-02-17 05:44 MST)
- Transactions table now includes a dedicated `Price` column (unit price at tx valuation time) to make `Value = Amount * Price` transparent (2026-02-17 05:57 MST)
- Transaction rows are now clickable to open the explorer tx page; Tx ID cell also links directly when a canonical tx hash exists (2026-02-17 05:57 MST)
- Removed top-level `Realized PnL` card from dashboard summary to reduce confusion while realized accounting remains under refinement (2026-02-17 05:57 MST)
- Added unit tests for explorer transaction URL building and synthetic inner-tx guard (`tests/utils.test.ts`) (2026-02-17 05:57 MST)

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
