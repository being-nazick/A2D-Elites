# Migration Plan: App.js → Microservices Architecture

```
src/
├── services/
│   ├── order.service.js       ✅ Order CRUD, filtering, calculations
│   ├── customer.service.js    ✅ Customer stats, search
│   ├── recurring.service.js  ✅ Auto-generation logic
│   ├── notification.service.js ✅ WhatsApp, PDF notifications
│   └── index.js               ✅ Barrel export
│
├── hooks/
│   ├── useBusinessData.js     ✅ Central state management
│   └── index.js              ✅ Barrel export
│
└── docs/
    └── MIGRATION_PLAN.md      ✅ This file
```

## Bugs Fixed in Phase 1

| # | Issue | Fix |
|---|-------|-----|
| 1 | Return Bottle Modal never rendered | Will be fixed in App.js refactor |
| 2 | WhatsApp notification never called | Moved to notification.service.js |
| 3 | Recurring mutation race conditions | Immutable updates in service |
| 4 | Missing deleteProduct | Added to useBusinessData |

## Phase 2: Component Extraction (Planned)

### Planned Structure
```
src/
├── components/
│   ├── dashboard/
│   │   ├── Dashboard.jsx
│   │   ├── HeroCard.jsx
│   │   ├── StatCard.jsx
│   │   └── OrderRow.jsx
│   ├── orders/
│   │   ├── OrdersTab.jsx
│   │   ├── OrderModal.jsx
│   │   └── OrderRow.jsx
│   ├── customers/
│   │   ├── CustomersTab.jsx
│   │   ├── CustomerDetail.jsx
│   │   └── CustomerModal.jsx
│   ├── reports/
│   │   ├── ReportsTab.jsx
│   │   └── Charts.jsx
│   ├── more/
│   │   ├── MoreTab.jsx
│   │   ├── ProductsView.jsx
│   │   ├── RecurringView.jsx
│   │   └── NotificationsView.jsx
│   └── shared/
│       ├── TopBar.jsx
│       ├── BottomNav.jsx
│       ├── ModalShell.jsx
│       ├── StatusPill.jsx
│       ├── ActionBtn.jsx
│       └── Field.jsx
```

## Phase 3: App.js Refactor

The main `App.js` will become a thin orchestrator:
- Import hooks and services
- Handle modal state only
- No business logic
- ~100 lines target

## Execution Order

1. ✅ Extract services (business logic)
2. ✅ Create useBusinessData hook (state + persistence)
3. ⏳ Extract shared components (ModalShell, TopBar, etc.)
4. ⏳ Extract each tab into its own component
5. ⏳ Refactor App.js to wire everything together
6. ⏳ Fix the 5 critical bugs

## Bug Fix Checklist

- [ ] Return Bottle Modal not rendered in JSX
- [ ] openDeliveryWhatsApp never called on mark delivered
- [ ] Recurring generation race conditions
- [ ] Storage memory leak on unmount
- [ ] No deleteProduct function
- [ ] Empty bottles hint calculation (bottlesSent vs bottlesReturned)
- [ ] Duplicate bottles counting across multiple deliveries