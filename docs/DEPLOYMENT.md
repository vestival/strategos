# Strategos Deployment Guide (Vercel + Neon/Supabase)

## 1) Prerequisites
- Vercel project created and linked (`vercel` done)
- Production PostgreSQL database provisioned (Neon or Supabase)
- Google OAuth app created in Google Cloud Console

## 2) Environment variables (production)
Add these in Vercel: Project -> Settings -> Environment Variables

### Required
- `DATABASE_URL`
  - Production Postgres URL.
  - Example: `postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require`
- `NEXTAUTH_URL`
  - Your stable production URL.
  - Example: `https://strategos.vestival.es`
- `NEXTAUTH_SECRET`
  - 32+ random chars.
  - Generate: `openssl rand -base64 32`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ALGORAND_INDEXER_URL`
  - Example: `https://mainnet-idx.algonode.cloud`
- `ALGORAND_ALGOD_URL`
  - Example: `https://mainnet-api.algonode.cloud`
- `ALGORAND_VERIFICATION_RECEIVER`
  - Algorand address that receives verification transaction.

### Optional / recommended
- `ALGORAND_INDEXER_TOKEN`
  - Empty for public indexer, token if provider requires it.
- `ALGORAND_ALGOD_TOKEN`
  - Empty for public algod, token if provider requires it.
- `PRICE_API_URL`
  - Example: `https://api.coingecko.com/api/v3/simple/price`
- `DEFI_LLAMA_PRICE_API_URL`
  - Example: `https://coins.llama.fi/prices/current`
- `ASA_PRICE_MAP_JSON`
  - Example: `{"31566704":"usd-coin","312769":"tether"}`
  - Note: app includes built-in defaults for common ASAs; this var is for overrides/extensions.
- `TINYMAN_APP_IDS`
  - Example: `552635992,1002541853`
- `FOLKS_APP_IDS`
  - Example: `971350278,1123472996`
- `RETI_APP_IDS`
  - Example: `2537013674`
- `PUBLIC_RATE_LIMIT_WINDOW_MS`
  - Example: `60000`
- `PUBLIC_RATE_LIMIT_MAX`
  - Example: `60`
- `INDEXER_TX_LIMIT`
  - Example: `500`
- `NEXT_PUBLIC_BASE_URL`
  - Example: `https://strategos.vestival.es`
- `NEXT_PUBLIC_SUPPORT_EMAIL`
  - Example: `support@strategos.vestival.es`

## 3) Google OAuth setup
In Google Cloud Console -> OAuth client:
- Authorized JavaScript origins:
  - `https://strategos.vestival.es`
- Authorized redirect URIs:
  - `https://strategos.vestival.es/api/auth/callback/google`

If you use a custom domain, replace the above with your custom domain.

In Vercel:
- Project -> Settings -> Domains -> add `strategos.vestival.es`
- Configure DNS records at your domain provider as instructed by Vercel.

## 4) Deploy commands
After env vars are set:

```bash
vercel --prod
```

## 5) Prisma migration on production DB
Run once after first deploy and on schema changes:

```bash
npx prisma migrate deploy
```

If your local machine IP is not allowed to reach DB, run migrations in CI or from a trusted environment.

## 6) Post-deploy checks
- Open `/` and verify Google sign-in works
- Link wallet and complete note-transaction verification
- Press Refresh on dashboard and confirm snapshot is created
- Confirm `/api/portfolio/snapshot` returns snapshot for signed-in user

## 7) Common failure fixes
- Build fails with "Invalid environment variables":
  - Missing env vars in Vercel production scope
- Google login fails:
  - Redirect URI mismatch with `NEXTAUTH_URL`
- DB errors at runtime:
  - Bad `DATABASE_URL` or missing `sslmode=require`
