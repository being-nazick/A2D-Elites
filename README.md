# A2D'Elites - Dairy Management App 🥛

A simple, offline-first React app built to handle the daily operations of a local dairy delivery business. It's designed to work well on mobile devices and runs completely locally using Capacitor for storage.

## What it actually does

*   **Daily Deliveries:** Add orders, mark them as delivered, and track who has paid vs. who owes money.
*   **Recurring Orders:** Set up "standing orders" (e.g., 2 bottles of milk every day, 1 paneer on Tuesdays). The app automatically creates today's orders when you open it.
*   **Bottle Tracking:** Tracks how many empty glass bottles a customer has returned versus how many were delivered.
*   **Customers:** A mini-CRM to see a customer's order history and total outstanding balance.
*   **Billing:** Generates a clean PDF bill that can be printed or shared. Also includes a quick WhatsApp button to send delivery confirmations.
*   **Reports:** Simple charts to see daily sales trends and 1-click CSV exports for accounting.

## Tech Stack

*   **React:** (UI and logic)
*   **Capacitor:** (`@capacitor/preferences` for saving data offline, plus native filesystem/share plugins).
*   **Lucide React:** For the icons.
*   **Recharts:** For the dashboard and report graphs.
*   **html2pdf.js:** Loaded dynamically to generate PDF bills on the fly.

## How to run it locally

1. Make sure you have your standard React environment set up (Vite is recommended).
2. Install the necessary dependencies:
   ```bash
   npm install lucide-react recharts @capacitor/core @capacitor/preferences @capacitor/filesystem @capacitor/share
   ```
3. Drop the code into your `App.jsx`.
4. Make sure you have a `logo.png` in your `public` folder so the header doesn't look broken.
5. Start it up:
   ```bash
   npm run dev
   ```

## A quick note on data storage 💾
Because this is an offline-first app, **there is no backend/database**. Everything is saved locally on the device using Capacitor's Preferences API. 

If you are testing this in a web browser, clearing your site data/Local Storage *will* wipe your test data. If deployed as a native Android/iOS app via Capacitor, the data persists safely on the device.
