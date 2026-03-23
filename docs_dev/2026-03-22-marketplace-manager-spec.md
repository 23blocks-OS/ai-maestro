# Marketplace Manager — Settings Page Feature Spec

## Overview

Add a Marketplace Manager tab to the Global Elements settings page. Two columns/tabs:
1. **Plugins** (existing) — shows all plugins with enable/disable + element listing
2. **Marketplaces** (new) — shows all registered marketplaces with their plugins

## Data Sources

- `~/.claude/settings.json` `extraKnownMarketplaces` — 243 registered marketplaces
- `~/.claude/settings.json` `enabledPlugins` — 66 plugin keys (name@marketplace)
- `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` — installed plugin files
- `~/.claude/plugins/marketplaces/<marketplace>/` — marketplace repo clones

## API Endpoints Needed

### GET /api/settings/marketplaces
Returns all registered marketplaces with their plugins and status:
```json
{
  "marketplaces": [
    {
      "name": "emasoft-plugins",
      "source": "github",
      "path": "...",
      "plugins": [
        {
          "name": "rechecker-plugin",
          "key": "rechecker-plugin@emasoft-plugins",
          "version": "2.0.51",
          "enabled": true,
          "installed": true,
          "hasUpdate": false,
          "errors": 0,
          "localScopes": ["~/agents/alexandre/"]
        }
      ]
    }
  ]
}
```

### POST /api/settings/marketplaces/action
Actions: install-plugin, uninstall-plugin, reinstall-plugin, update-plugin,
         update-marketplace, remove-marketplace

## UI Design

### Marketplaces Tab
- Scrollable list of marketplace cards
- Each card shows: name, source type (github/local/directory), plugin count
- Expandable: shows all plugins with status badges
  - Enabled (green), Disabled (gray), Not Installed (outlined), Outdated (amber)
- Click plugin → navigates to plugin card in Plugins tab
- Marketplace actions: Update, Reinstall, Remove

### Plugin Cards (enhanced)
- Current enable/disable toggle (keep)
- Add: Install/Uninstall/Update buttons
- Scope indicator: User / Local (with list of local projects)
- Error count badge (red if >0, expandable error list)
- Version info
- Element count summary

## Implementation Phases

### Phase 1: Marketplace listing API + basic UI
- GET /api/settings/marketplaces
- Marketplace tab with cards showing plugins
- Status badges per plugin

### Phase 2: Plugin actions
- Install/uninstall/update via POST API
- Error detection and display
- Scope management

### Phase 3: Advanced features
- Local scope project listing
- Marketplace update/remove
- Outdated detection
