# Sidebar Polish & Page Layout Standardization — Design Spec

**Date:** 2026-04-04
**Scope:** Fix sidebar content (remove search, add starring), standardize all page layouts, verify library best practices.

---

## 1. Page Layout Standard

**Model:** Full-width with generous padding. No `max-w-*` constraints.

All scrollable pages (Dashboard, Projects, Files) use:
- Root wrapper: `px-8 py-6` — content stretches full width
- Page header: single row, `flex justify-between items-center mb-6`
  - Left: `text-lg font-semibold` title
  - Right: optional action button (e.g., "+ New Project")
  - No subtitles on any page
- Content grids use responsive columns to fill available space

Full-height pages (Ideas, ProjectDetail) keep their existing height model (`h-[calc(100vh-48px)]`) but standardize their title text size to match.

### Pages to update

| Page | Current Root | New Root | Header Change |
|------|-------------|----------|---------------|
| Dashboard | `p-8 max-w-6xl space-y-8` | `px-8 py-6 space-y-6` | Remove subtitle, standardize h1 to `text-lg font-semibold` |
| Projects | `p-8` | `px-8 py-6` | Already has title + button, just standardize h1 size |
| Files | `p-8 max-w-6xl mx-auto space-y-6` | `px-8 py-6 space-y-6` | Remove `max-w-6xl mx-auto`, remove subtitle |
| Ideas | `flex h-[calc(100vh-48px)]` | No change to root | Standardize left-pane header h1 size |
| ProjectDetail | `flex flex-col h-[calc(100vh-48px)]` | No change to root | Standardize h1 size in sticky header |

---

## 2. Sidebar Changes

### Remove Search
- Delete the Search button from `Sidebar.tsx` entirely
- No shortcut hint, no placeholder — just remove it

### Favorites → Starred Projects
- Rename section from "Favorites" to "Starred"
- Show projects where `starred = 1`
- When no projects are starred, **hide the section entirely** (no empty dashed box)
- Each starred project links to `/projects/:id` with a folder icon + truncated name

### Recent Section
- Keep as-is (shows last 5 projects)
- When empty, hide section (remove dashed empty state box to match Starred behavior)

---

## 3. Starring Capability

### Database
- Add column to `projects` table: `starred INTEGER NOT NULL DEFAULT 0`
- Migration: `ALTER TABLE projects ADD COLUMN starred INTEGER NOT NULL DEFAULT 0`

### API
- `PUT /api/projects/:id/star` — toggles `starred` between 0 and 1
- Returns the updated project
- Uses `ownsProject()` authorization check

### UI — Project Cards (Projects page)
- Add a star icon button (top-right of card or inline with title)
- Filled star when `starred = 1`, outline star when `starred = 0`
- Clicking toggles via mutation + invalidates `["projects"]` query

### UI — ProjectDetail header
- Add star icon button next to the project name in the sticky header
- Same toggle behavior

### UI — Sidebar
- Starred section shows starred projects sorted by name
- Uses same `api.projects.list` query, filtered client-side by `starred === 1`

---

## 4. Library Best Practices — Verified

All libraries checked against Context7 documentation:

| Library | Version | Status |
|---------|---------|--------|
| React | 18.3.1 | No deprecated APIs in app code. All hooks used correctly. |
| @tanstack/react-query | 5.62.0 | Correct v5 object signature. `isPending` for mutations, `onSuccess` only on mutations. Cache invalidation correct. |
| Tailwind CSS | ^3.4.0 | Current for v3. `@tailwind`/`@layer` directives correct. |
| React Router DOM | 6.28.0 | All APIs valid. `BrowserRouter` pattern works (optional modernization to `createBrowserRouter` deferred). |

No code changes needed for library compliance.

---

## 5. Out of Scope

- Search functionality (removed, build later as command palette)
- Tailwind v4 migration
- React Router v7 migration
- React 19 upgrade
