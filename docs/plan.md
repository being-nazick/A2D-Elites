```markdown
# Migration & Refactoring Plan: React & Capacitor Diary App

> **Overview:** Plan for modularizing the monolithic `App.js` (1,450+ lines) into clean, maintainable, single-responsibility modules and services without breaking native Capacitor plugins, React state, or existing dependencies[cite: 1].

---

## 🏗️ Target Project Architecture


```

src/
├── services/
│   ├── diary.service.js       ✅ Entry CRUD, local database/storage sync, search & filtering
│   ├── media.service.js       ✅ Camera integration, native filesystem operations, image compression
│   ├── storage.service.js     ✅ Capacitor Preferences/Storage key-value persistence
│   ├── export.service.js      ✅ PDF rendering, JSON backup/restore, share extension
│   └── index.js               ✅ Barrel export for all core services
│
├── hooks/
│   ├── useDiaryEntries.js     ✅ State management for diary logs, pagination & search
│   ├── useMediaPicker.js      ✅ Camera/Gallery access & image buffer handling
│   ├── useCapacitorNative.js  ✅ Device hooks (Keyboard, App status, Haptics, Orientation)
│   └── index.js               ✅ Barrel export for custom hooks
│
├── components/
│   ├── EntryCard.jsx          ✅ Individual diary entry display component
│   ├── EntryEditor.jsx        ✅ Rich text / Markdown editor for creating/editing entries
│   ├── MediaGallery.jsx       ✅ Media preview and full-screen gallery modal
│   ├── SearchBar.jsx          ✅ Filtering and query control component
│   └── index.js               ✅ Barrel export for UI components
│
├── utils/
│   ├── date.utils.js          ✅ Formatting dates, timestamps, calendar utilities
│   ├── sanitize.utils.js      ✅ HTML/Text sanitization and input validation
│   └── index.js               ✅ Barrel export for utilities
│
└── docs/
└── PLAN.md      ✅ Comprehensive refactoring roadmap and guide

```

---

## 📋 Phased Refactoring Strategy

To ensure zero downtime, breakages, or circular import loops, execute the migration across four incremental phases[cite: 1].


```

Phase 1: Pure Utilities & Native Storage
└── Isolate date helpers, string sanitizers, and Capacitor Preferences key-value storage.

Phase 2: Core Native Services & Media Handling
└── Abstract Camera, Filesystem, and PDF/Backup export logic into dedicated service modules.

Phase 3: React Custom Hooks & State Extraction
└── Shift business logic, sync routines, and UI side-effects into `useDiaryEntries` & `useMediaPicker`.

Phase 4: Component Decomposition & Final Clean App.js
└── Extract sub-views (Editor, Card, Gallery) and assemble the lightweight container in `App.js`.

```

---

## ⚙️ Module Responsibilities Breakdown

### 1. Services Layer (`src/services/`)
* **`diary.service.js`**: Pure data operations for diary entries (create, update, delete, search, filter by tag/date)[cite: 1].
* **`media.service.js`**: Wraps `@capacitor/camera` and `@capacitor/filesystem`[cite: 1]. Manages saving photo binaries to device storage and retrieving local web paths[cite: 1].
* **`storage.service.js`**: Wraps `@capacitor/preferences` for user settings, dark mode preferences, and local data persistence[cite: 1].
* **`export.service.js`**: Handles offline data backups (JSON export/import) and PDF report generation[cite: 1].

### 2. Hooks Layer (`src/hooks/`)
* **`useDiaryEntries.js`**: Central state hook managing entry list state, async loading triggers, and reactive filtering[cite: 1].
* **`useMediaPicker.js`**: Manages native photo capture flows, loading states, and media permissions handling[cite: 1].
* **`useCapacitorNative.js`**: Handles native device listeners (e.g., hardware back button, keyboard toggle, app pause/resume)[cite: 1].

### 3. Components Layer (`src/components/`)
* **`EntryCard.jsx`**: Renders entry metadata, formatted timestamps, snippet preview, and attached media thumbnails[cite: 1].
* **`EntryEditor.jsx`**: Manages active entry drafting, auto-save triggers, and inline media attachments[cite: 1].
* **`MediaGallery.jsx`**: Handles fullscreen photo views, deletion confirmations, and media viewer swiping[cite: 1].

---

## 🎯 Step-by-Step Execution Plan

### Step 1: Extract Utilities & Storage Abstractions
Create independent helper files that have no dependencies on React state or components[cite: 1].
```bash
# Files to create in Step 1:
- src/utils/date.utils.js
- src/utils/sanitize.utils.js
- src/services/storage.service.js

```

### Step 2: Extract Capacitor Native Plugins

Wrap Capacitor native plugins inside native service modules with fallback checks for browser testing.

```bash
# Files to create in Step 2:
- src/services/media.service.js
- src/services/export.service.js
- src/services/diary.service.js
- src/services/index.js

```

### Step 3: Implement State Management Hooks

Extract all `useState` and `useEffect` logic away from `App.js` into custom React hooks.

```bash
# Files to create in Step 3:
- src/hooks/useDiaryEntries.js
- src/hooks/useMediaPicker.js
- src/hooks/useCapacitorNative.js
- src/hooks/index.js

```

### Step 4: Extract UI Components & Reassemble `App.js`

Extract UI chunks into modular components and turn `App.js` into a slim router/container component (~100-150 lines max).

```bash
# Files to create in Step 4:
- src/components/EntryCard.jsx
- src/components/EntryEditor.jsx
- src/components/MediaGallery.jsx
- src/components/SearchBar.jsx
- src/components/index.js

```

---

## 🛠️ Execution Checklist

* [ ] Create folder structure under `src/` (`services`, `hooks`, `components`, `utils`, `docs`)


* [ ] Extract pure JavaScript utility functions into `src/utils/`

* [ ] Isolate native Capacitor calls (`Camera`, `Filesystem`, `Preferences`) into `src/services/`

* [ ] Move entry state management and side effects into `useDiaryEntries` hook


* [ ] Move native event listeners into `useCapacitorNative` hook


* [ ] Extract UI elements into atomic React components in `src/components/`

* [ ] Verify barrel exports (`index.js`) for clean single-line imports


* [ ] Test web build and native mobile build (`npx cap run android` / `npx cap run ios`)



```

```