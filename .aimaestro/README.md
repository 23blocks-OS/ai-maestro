# AI Maestro Configuration Directory

This directory contains configuration files for AI Maestro.

## Hosts Configuration

Configure remote worker hosts to enable the Manager/Worker pattern for multi-host session management.

### Setup

**Option 1: Configuration File (Recommended)**

1. Copy the example file:
   ```bash
   cp hosts.example.json hosts.json
   ```

2. Edit `hosts.json` with your remote hosts:
   ```json
   {
     "hosts": [
       {
         "id": "local",
         "name": "Local Machine",
         "url": "http://localhost:23000",
         "type": "local",
         "enabled": true
       },
       {
         "id": "mac-mini",
         "name": "Mac Mini",
         "url": "http://100.80.12.6:23000",
         "type": "remote",
         "enabled": true,
         "tailscale": true
       }
     ]
   }
   ```

3. Restart AI Maestro:
   ```bash
   pm2 restart ai-maestro
   ```

**Option 2: Environment Variable**

Set the `AIMAESTRO_HOSTS` environment variable:

```bash
export AIMAESTRO_HOSTS='[{"id":"mac-mini","name":"Mac Mini","url":"http://100.80.12.6:23000","type":"remote","enabled":true}]'
```

Add to `ecosystem.config.js`:

```javascript
env: {
  NODE_ENV: 'production',
  PORT: 23000,
  AIMAESTRO_HOSTS: '[{"id":"mac-mini","name":"Mac Mini","url":"http://100.80.12.6:23000","type":"remote","enabled":true}]'
}
```

### Host Configuration Schema

```typescript
{
  id: string           // Unique identifier (e.g., "mac-mini")
  name: string         // Display name (e.g., "Mac Mini")
  url: string          // Base URL (e.g., "http://100.80.12.6:23000")
  type: 'local' | 'remote'
  enabled: boolean     // Set to false to temporarily disable
  tailscale?: boolean  // Optional: true if using Tailscale
  tags?: string[]      // Optional: custom tags
  description?: string // Optional: description
}
```

### Requirements

**For each remote host:**

1. AI Maestro must be running on the remote machine
2. Port 23000 must be accessible (via Tailscale or local network)
3. Same or compatible AI Maestro version

### Example: Adding Mac Mini as Remote Host

**On Mac Mini:**

1. Install AI Maestro
2. Start with pm2: `pm2 start ecosystem.config.js`
3. Verify it's accessible: `curl http://localhost:23000/api/sessions`

**On MacBook (Manager):**

1. Get Mac Mini's Tailscale IP: `ping mac-mini.tail<hash>.ts.net`
2. Add to `hosts.json`:
   ```json
   {
     "id": "mac-mini",
     "name": "Mac Mini",
     "url": "http://100.80.12.6:23000",
     "type": "remote",
     "enabled": true,
     "tailscale": true
   }
   ```
3. Restart: `pm2 restart ai-maestro`
4. Open dashboard: Sessions from Mac Mini will appear with a host indicator

### Troubleshooting

**Sessions not appearing from remote host:**

1. Check host is enabled in config
2. Verify AI Maestro is running on remote host: `pm2 status` (on remote)
3. Test connectivity: `curl http://<remote-ip>:23000/api/sessions`
4. Check AI Maestro logs: `pm2 logs ai-maestro`

**Connection timeout:**

- Verify network connectivity (Tailscale connected, firewall allows port 23000)
- Check remote host URL is correct
- Increase timeout in `lib/session-discovery.ts` if needed

### Security Notes

- Remote hosts have no authentication in Phase 1
- Use Tailscale VPN for secure access
- Only add trusted hosts
- Do not expose port 23000 to public internet

### Documentation

See `docs/REMOTE-SESSIONS-ARCHITECTURE.md` for complete architecture documentation.
