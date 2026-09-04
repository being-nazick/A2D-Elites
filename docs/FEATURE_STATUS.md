# A2D'Elites Feature Status

## Overview

A2D'Elites is an offline-first dairy delivery management app for the business owner. It runs as a React web app and a Capacitor Android app.

## Features Added

- Dashboard with daily sales, pending deliveries, delivered orders, bottle collection, and monthly sales.
- Order management with product quantities, pricing, delivery dates, payment status, notes, billing, and WhatsApp confirmation.
- Customer management with order history, outstanding payments, bottle balance, address, and GPS coordinates.
- Empty bottle tracking: delivered milk bottles minus returned empty bottles.
- Customer navigation using Google Maps.
- Multi-customer route selection using Google Maps waypoints.
- Recurring daily and weekly orders.
- Product and price management.
- Reports with sales charts and CSV exports.
- Offline persistence using Capacitor Preferences.
- Native file sharing and PDF bill generation.
- Android support with Capacitor Filesystem, Geolocation, Preferences, and Share plugins.
- Initial modularization of constants, helpers, storage, shared UI, Dashboard, and Orders.

## Current Architecture

```text
src/
  app/                 Shared constants, helpers, and Capacitor storage
  components/          Shared UI components
  features/dashboard/  Dashboard feature
  features/orders/     Orders feature
  assets/              Application assets
  App.js               Remaining app orchestration and features
```

## Yet to Scale

- Extract Customers, Reports, Products, Recurring, Notifications, and modal components from `App.js`.
- Move billing, CSV export, WhatsApp, recurring-order generation, and CRUD logic into services.
- Add automated tests for bottle balances, GPS capture, route URLs, recurring orders, and payment totals.
- Replace local Preferences-only storage with a structured local database when data volume grows.
- Add backup and restore for business data.
- Add route ordering or optimization through Google Routes API, Mapbox, or OpenRouteService.
- Add authentication and cloud sync if multiple devices or staff accounts are required.
- Add pagination, stronger validation, error reporting, and data migration/versioning.
- Add production Android release signing and CI build automation.

## Development Checks

```powershell
npm install
npm test -- --watchAll=false --runInBand
npm run build
npx cap sync android
android\gradlew.bat -p android assembleDebug
```

`android/local.properties` is machine-specific and must remain ignored. The current Android setup uses Java 21 and the SDK path configured locally by the developer.
