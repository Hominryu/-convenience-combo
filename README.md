# 편의점꿀조합

Apps in Toss React WebView mini app.

## First Release Scope

- 3 bottom tabs only: Home, Result, Promotion Products
- Anonymous usage: promotion search and one free combo
- Rewarded ad hooks: extra combos, 4-retailer comparison, reroll, monthly TOP 20
- Login later: favorites, history, promotion alerts, purchase restoration
- No store-level inventory, maps, reviews, alcohol, tobacco, or complex subscription

## Core Calculation

Promotion products are converted into purchase options:

- Normal: pay 1, receive 1
- 1+1: pay 1, receive 2
- 2+1: pay 2, receive 3
- 3+1: pay 3, receive 4

The app separates payment amount, received quantity, benefit amount, effective unit price, and leftover budget.

## Production Architecture

- Frontend: React + TypeScript + Vite
- Mini app runtime: Apps in Toss WebView
- Backend: Vercel Functions
- DB: Supabase PostgreSQL
- Crawlers: retailer adapters for CU, GS25, 7-Eleven, eMart24
- AI: Gemini for normalization, tagging, short descriptions only
- Ads: Apps in Toss in-app ads

## Development

```bash
npm run dev
npm run build
npm run deploy
```
