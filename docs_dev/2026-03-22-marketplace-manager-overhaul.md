# Marketplace Manager Overhaul Plan (2026-03-22)

## API Changes Needed

### GET /api/settings/marketplaces — Enhanced response
- [ ] List ALL plugins from each marketplace (scan marketplace clone dirs, not just cache)
- [ ] Show marketplace version (from marketplace.json)
- [ ] Show marketplace source URL/path
- [ ] Show plugin source URL/path (may differ from marketplace)
- [ ] Distinguish installed (user-scope cache) vs not-installed
- [ ] Local-scope plugins shown as NOT installed
- [ ] Show plugin errors (investigate nanobanana error)
- [ ] Exclude ai-maestro-local-agents-marketplace from listing

### POST /api/settings/marketplaces — Actions
- [ ] install: clone plugin from marketplace dir to cache + enable
- [ ] uninstall: remove from cache + disable (already done)
- [ ] update: re-clone from marketplace (already done as reinstall)
- [ ] delete-marketplace: remove from extraKnownMarketplaces + clean cache + remove clone
- [ ] add-marketplace: add GitHub URL to extraKnownMarketplaces + clone
- [ ] security-check: placeholder (run security script on plugin folder)

## UI Changes

### Layout
- [x] Remove 3 tabs (Installed/All/Empty) — just list all installed marketplaces
- [ ] Search-as-you-type filter on marketplace list
- [ ] Search-as-you-type filter inside each marketplace's plugin list
- [ ] Accordion: expanding one marketplace collapses others
- [ ] Loading spinner on expand if data loading takes time
- [ ] "Add Marketplace" input at top (GitHub URL)

### Marketplace Header
- [ ] Show full source URL/path label
- [ ] Show version number
- [ ] Arrow/link button opens source URL in new tab (only if URL, not path)
- [ ] Delete marketplace trash icon with confirmation popup

### Plugin Row
- [ ] Show ALL plugins (installed + uninstalled from marketplace clone)
- [ ] Installed plugins: enable/disable switch + update button + uninstall button
- [ ] Uninstalled plugins: install button only (no switch)
- [ ] Show plugin source URL/path
- [ ] Arrow button opens plugin source in new tab
- [ ] Error label (red) for plugins with errors — click expands error list
- [ ] Security check mini button (placeholder)
- [ ] Mini-style buttons consistent with dashboard style

### Exclusions
- [ ] Hide ai-maestro-local-agents-marketplace (its plugins shown in Elements tab instead)
