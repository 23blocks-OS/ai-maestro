# AI Maestro: Manager/Worker Setup Tutorial

Step-by-step guide to configure AI Maestro's distributed architecture for managing agents across multiple machines.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start (5 Minutes)](#quick-start-5-minutes)
- [Detailed Setup](#detailed-setup)
- [Network Options](#network-options)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### On Every Machine (Manager + Workers)

**Required:**
- ✅ macOS 12.0+ (Monterey or later)
- ✅ Node.js 18.17+ or 20.x
- ✅ tmux 3.0+
- ✅ Git

**Recommended:**
- ✅ Tailscale (for secure remote access)
- ✅ pm2 (for running as a service)

**Installation:**
```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install dependencies
brew install node tmux git

# Install pm2 globally
npm install -g pm2

# Install Tailscale (recommended for remote workers)
brew install --cask tailscale
```

---

## Quick Start (5 Minutes)

Follow these steps to connect your first remote worker.

### Step 1: Install AI Maestro on Both Machines

**On Manager (your laptop):**
```bash
# Clone repository
git clone https://github.com/23blocks-OS/ai-maestro.git
cd ai-maestro

# Install dependencies
yarn install

# Build
yarn build

# Start with pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow instructions to enable auto-start
```

**On Worker (remote machine):**
```bash
# Same steps as Manager
git clone https://github.com/23blocks-OS/ai-maestro.git
cd ai-maestro
yarn install
yarn build
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Step 2: Get Worker's IP Address

**Option A: Using Tailscale (Recommended)**
```bash
# On Worker machine
tailscale ip -4
# Example output: 100.80.12.6
```

**Option B: Using Local Network**
```bash
# On Worker machine
ifconfig | grep "inet " | grep -v 127.0.0.1
# Example output: 192.168.1.100
```

### Step 3: Add Worker in AI Maestro Settings

**On Manager (in browser):**
1. Open http://localhost:23000
2. Click **Settings** (bottom of sidebar)
3. Click **Add Host**
4. Enter worker URL: `http://100.80.12.6:23000` (or `http://192.168.1.100:23000`)
5. Click **Discover Host**
   - ✅ If successful: See green checkmark
   - ❌ If failed: See [Troubleshooting](#troubleshooting)
6. Customize name: "Mac Mini" or "Cloud Server"
7. Click **Add Host**

### Step 4: Create Agent on Remote Worker

1. Go back to Dashboard (click "Back to Dashboard")
2. Click **+** (Create New Agent)
3. Select host: Choose your new worker from dropdown
4. Enter agent name: `test-remote-agent`
5. Click **Create Agent**

🎉 **Done!** You should see your agent appear with a blue "Worker Name" badge.

---

## Detailed Setup

### Scenario 1: Laptop + Desktop (Tailscale)

**Goal:** Access desktop from anywhere via encrypted VPN.

**Step 1: Setup Tailscale on Both Machines**

```bash
# On both Manager and Worker
brew install --cask tailscale

# Start Tailscale
open /Applications/Tailscale.app

# Login with your Tailscale account (same account on both!)
# Approve devices in Tailscale admin console
```

**Step 2: Note IP Addresses**

```bash
# On Worker (desktop)
tailscale ip -4
# Example: 100.80.12.6

# On Manager (laptop)
tailscale ip -4
# Example: 100.95.23.10
```

**Step 3: Test Connectivity**

```bash
# On Manager (laptop)
curl http://100.80.12.6:23000/api/sessions
# Should return: {"sessions":[...]}
```

**Step 4: Add Worker via Settings UI**

See [Quick Start Step 3](#step-3-add-worker-in-ai-maestro-settings)

**Benefits:**
- ✅ Works from anywhere (home, coffee shop, vacation)
- ✅ Encrypted WireGuard tunnel
- ✅ No port forwarding needed
- ✅ No firewall configuration

**Use Case:** Remote access to home desktop from laptop

---

### Scenario 2: Multiple Machines on Local Network

**Goal:** Fast local network without VPN overhead.

**Step 1: Find Local IP Addresses**

```bash
# On each machine
ifconfig en0 | grep "inet "
# Example output: inet 192.168.1.100

# Or use network preferences
# System Preferences → Network → WiFi/Ethernet → Details
```

**Step 2: Test Connectivity**

```bash
# On Manager
curl http://192.168.1.100:23000/api/sessions
```

**Step 3: Optional - Configure .local Domain**

macOS supports Bonjour/mDNS for `.local` domains:

```bash
# Check hostname
hostname
# Example: Mac-Mini.local

# Test from Manager
curl http://Mac-Mini.local:23000/api/sessions
```

**Step 4: Add Workers via Settings UI**

Use local IPs or `.local` domains in the Add Host wizard.

**Benefits:**
- ✅ Fastest performance (no VPN overhead)
- ✅ Simple setup
- ✅ No external service dependency

**Drawbacks:**
- ❌ Only works on same network
- ❌ Unencrypted traffic

**Use Case:** Home lab, office network, trusted environments

---

### Scenario 3: Cloud Server (Tailscale)

**Goal:** Add AWS/DigitalOcean/Hetzner server as worker.

**Step 1: Install AI Maestro on Cloud Server**

```bash
# SSH into your cloud server
ssh user@your-server.com

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install tmux
sudo apt-get install -y tmux

# Clone and build AI Maestro
git clone https://github.com/23blocks-OS/ai-maestro.git
cd ai-maestro
npm install -g yarn
yarn install
yarn build

# Install pm2
npm install -g pm2

# Start AI Maestro
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow instructions
```

**Step 2: Install Tailscale on Cloud Server**

```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Start Tailscale
sudo tailscale up

# Get Tailscale IP
tailscale ip -4
# Example: 100.123.45.67
```

**Step 3: Add Cloud Worker via Settings UI**

Use Tailscale IP: `http://100.123.45.67:23000`

**Benefits:**
- ✅ Secure access over internet
- ✅ No need to expose port 23000 publicly
- ✅ Same workflow as local machines

**Cost Optimization:**
```bash
# Stop worker when not needed
pm2 stop ai-maestro

# Restart when needed
pm2 start ai-maestro
```

**Use Case:** Bursty workloads, platform-specific builds (Linux), CI/CD

---

## Network Options Comparison

| Option | Security | Speed | Complexity | Works Remote? | Cost |
|--------|----------|-------|------------|---------------|------|
| **Tailscale** | ✅✅✅ Encrypted | ✅✅ Fast | ✅✅ Easy | ✅ Yes | Free tier available |
| **Local Network** | ⚠️ Unencrypted | ✅✅✅ Fastest | ✅✅✅ Easiest | ❌ No | Free |
| **Port Forwarding** | ⚠️⚠️ Exposed port | ✅✅ Fast | ⚠️ Complex | ✅ Yes | Free |
| **VPN (OpenVPN)** | ✅✅✅ Encrypted | ✅ Moderate | ⚠️⚠️ Hard | ✅ Yes | Varies |

**Recommendation:** Use Tailscale for remote workers, local network for trusted home/office.

---

## Advanced Configuration

### Running Different Ports

If you need to run multiple workers on the same machine (not common):

```javascript
// ecosystem.config.js on Worker #2
module.exports = {
  apps: [{
    name: 'ai-maestro-worker2',
    script: './server.mjs',
    env: {
      NODE_ENV: 'production',
      PORT: 23001,  // Different port
    },
  }],
}
```

Add in Settings: `http://100.80.12.6:23001`

### Firewall Configuration (if needed)

**macOS:**
```bash
# Allow port 23000
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/node
```

**Linux (ufw):**
```bash
# Allow from Tailscale only
sudo ufw allow from 100.0.0.0/8 to any port 23000
```

### Health Monitoring

Test worker health:
```bash
# Check if worker is responding
curl http://100.80.12.6:23000/api/sessions

# Check pm2 status
pm2 status

# View logs
pm2 logs ai-maestro
```

---

## Troubleshooting

### Worker Discovery Fails

**Symptom:** "Connection timeout - host is not reachable"

**Solutions:**

1. **Check if AI Maestro is running on worker:**
   ```bash
   # On worker machine
   pm2 status
   # Should show: ai-maestro | online
   ```

2. **Test connectivity:**
   ```bash
   # On manager machine
   curl http://WORKER_IP:23000/api/sessions
   # Should return JSON with sessions
   ```

3. **Check firewall:**
   ```bash
   # On worker machine (macOS)
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
   # If enabled, add Node.js to allowed apps
   ```

4. **Verify Tailscale is connected:**
   ```bash
   # On both machines
   tailscale status
   # Should show: Connected
   ```

5. **Try local IP instead of Tailscale:**
   ```bash
   # Get local IP
   ifconfig | grep "inet "
   # Use: http://192.168.x.x:23000
   ```

### Agents Not Appearing

**Symptom:** Worker added successfully, but agents don't show

**Solutions:**

1. **Create a test agent on worker:**
   ```bash
   # SSH into worker or access its terminal
   tmux new-session -s test-worker-session
   # Detach: Ctrl+B, then D
   ```

2. **Refresh AI Maestro dashboard:**
   - Click refresh button in sidebar
   - Or reload browser (Cmd+R)

3. **Check worker logs:**
   ```bash
   # On worker
   pm2 logs ai-maestro
   # Look for errors
   ```

### WebSocket Connection Fails

**Symptom:** Agent appears but terminal is blank or shows "Connecting..."

**Solutions:**

1. **Check session exists on worker:**
   ```bash
   # On worker
   tmux ls
   # Should list the session
   ```

2. **Check WebSocket upgrade in browser console:**
   ```
   Developer Tools → Console
   Look for: "WebSocket connection failed"
   ```

3. **Verify Manager can reach worker:**
   ```bash
   # On manager
   curl http://WORKER_IP:23000/api/sessions
   ```

4. **Check for proxy/firewall blocking WebSockets:**
   - Some corporate firewalls block WebSocket upgrades
   - Test on different network (mobile hotspot)

### Permission Denied

**Symptom:** Can't create agents on worker

**Solutions:**

1. **Check file permissions:**
   ```bash
   # On worker
   ls -la ~/.aimaestro/
   # Should be owned by your user
   ```

2. **Check tmux permissions:**
   ```bash
   # On worker
   tmux new-session -s permission-test
   # If this fails, tmux has issues
   ```

---

## Best Practices

### Security

- ✅ Use Tailscale for remote workers
- ✅ Use strong Tailscale account password + 2FA
- ✅ Don't expose port 23000 to public internet
- ✅ Use OS user accounts to isolate users
- ✅ Regularly update AI Maestro and dependencies

### Performance

- ✅ Use local network for workers in same location
- ✅ Use Tailscale "exit nodes" for regional cloud workers
- ✅ Monitor worker resource usage (pm2 monit)
- ✅ Close unused agents to free resources

### Reliability

- ✅ Use pm2 auto-restart: `pm2 startup`
- ✅ Monitor workers with health checks (Settings → Hosts → test icon)
- ✅ Keep workers on stable power (UPS for critical machines)
- ✅ Use cloud workers as backup for critical tasks

---

## Next Steps

- [Concepts Guide](./CONCEPTS.md) - Understand the architecture
- [Use Cases](./USE-CASES.md) - See real-world examples
- [Network Access](./NETWORK-ACCESS.md) - Detailed networking guide
- [GitHub Issues](https://github.com/23blocks-OS/ai-maestro/issues) - Get help or report bugs
