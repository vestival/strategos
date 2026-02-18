# Strategos Brand & Visual Identity

Last updated: 2026-02-18

## Brand

- Name: `Strategos`
- Tagline: `Architect of Capital.`
- Tone:
  - Institutional
  - Minimal
  - Precise
  - Professional
  - No crypto slang
  - No hype language

## Typography

- Brand / logo / hero headings: `Cinzel` (Google Fonts)
- UI and body text: `Inter` (Google Fonts)

## Color System

- Primary Navy: `#0F172A`
- Secondary Steel: `#1E293B`
- Accent Blue: `#1D4ED8`
- Light: `#F8FAFC`
- Slate: `#CBD5E1`
- Success: `#16A34A`
- Warning: `#F59E0B`
- Error: `#DC2626`

## UI Direction

- Dark-first only.
- High contrast with restrained accent usage.
- Clear hierarchy; compact, decision-oriented layouts.
- No speculative or promotional microcopy.

## Metadata Standard

- Title: `Strategos | Architect of Capital`
- Description:
  - `Strategos is a portfolio intelligence platform for disciplined investors. Track, analyze, and understand your capital with clarity.`

## Domain & Canonical

- Production base URL: `https://strategos.vestival.es`
- Canonical and Open Graph URLs derive from `NEXT_PUBLIC_BASE_URL`.
- No hardcoded `vercel.app` domain should be present in app metadata.

## Legal Surface

- Required pages:
  - `/privacy`
  - `/terms`
- Footer must always expose links to both pages.

## Localization

- Default locale: English (`en`)
- Secondary locale: Spanish (`es`)
- Translation source files:
  - `locales/en.json`
  - `locales/es.json`

## Implementation Map

- Metadata and global shell: `src/app/layout.tsx`
- Global styles and theme defaults: `src/app/globals.css`
- Footer: `src/components/app-footer.tsx`
- Locale dictionaries: `locales/*.json`
- i18n resolver: `src/lib/i18n/translations.ts`
- Legal pages:
  - `src/app/privacy/page.tsx`
  - `src/app/terms/page.tsx`
  - `src/components/legal/legal-page.tsx`
