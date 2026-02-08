#!/bin/bash

# Script to convert PM2 from user agent to system daemon
# This fixes EHOSTUNREACH errors by running PM2 as root (exempt from Local Network Privacy)

set -e

echo "🔧 Converting PM2 to system daemon to bypass Local Network Privacy..."
echo ""

# Step 1: Remove existing user-level PM2 startup
echo "Step 1: Removing user-level PM2 launchd agent..."
sudo env PATH=$PATH:/Users/juanpelaez/.nvm/versions/node/v20.19.0/bin /Users/juanpelaez/.nvm/versions/node/v20.19.0/lib/node_modules/pm2/bin/pm2 unstartup launchd -u juanpelaez --hp /Users/juanpelaez
echo "✅ User agent removed"
echo ""

# Step 2: Create system-level daemon plist
echo "Step 2: Creating system daemon plist..."
cat > /tmp/com.aimaestro.daemon.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>com.aimaestro.daemon</string>
	<key>UserName</key>
	<string>juanpelaez</string>
	<key>WorkingDirectory</key>
	<string>/Users/juanpelaez/23blocks/webApps/agents-web</string>
	<key>ProgramArguments</key>
	<array>
		<string>/Users/juanpelaez/.nvm/versions/node/v20.19.0/bin/node</string>
		<string>/Users/juanpelaez/23blocks/webApps/agents-web/server.mjs</string>
	</array>
	<key>EnvironmentVariables</key>
	<dict>
		<key>PATH</key>
		<string>/Users/juanpelaez/.nvm/versions/node/v20.19.0/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
		<key>NODE_ENV</key>
		<string>production</string>
		<key>PORT</key>
		<string>23000</string>
	</dict>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<dict>
		<key>SuccessfulExit</key>
		<false/>
	</dict>
	<key>StandardOutPath</key>
	<string>/Users/juanpelaez/.aimaestro/logs/daemon-out.log</string>
	<key>StandardErrorPath</key>
	<string>/Users/juanpelaez/.aimaestro/logs/daemon-error.log</string>
</dict>
</plist>
EOF
echo "✅ Plist created"
echo ""

# Step 3: Create log directory
echo "Step 3: Creating log directory..."
mkdir -p /Users/juanpelaez/.aimaestro/logs
echo "✅ Log directory created"
echo ""

# Step 4: Install daemon plist
echo "Step 4: Installing daemon plist to /Library/LaunchDaemons..."
sudo cp /tmp/com.aimaestro.daemon.plist /Library/LaunchDaemons/
sudo chown root:wheel /Library/LaunchDaemons/com.aimaestro.daemon.plist
sudo chmod 644 /Library/LaunchDaemons/com.aimaestro.daemon.plist
echo "✅ Daemon plist installed"
echo ""

# Step 5: Stop existing PM2 processes
echo "Step 5: Stopping existing PM2 processes..."
pm2 stop all || true
pm2 delete all || true
echo "✅ PM2 processes stopped"
echo ""

# Step 6: Load the daemon
echo "Step 6: Loading system daemon..."
sudo launchctl bootstrap system /Library/LaunchDaemons/com.aimaestro.daemon.plist
echo "✅ Daemon loaded"
echo ""

# Step 7: Verify
echo "Step 7: Verifying daemon is running..."
sleep 2
if sudo launchctl list | grep -q com.aimaestro.daemon; then
	echo "✅ Daemon is running!"
	echo ""
	echo "📋 View logs:"
	echo "   tail -f ~/.aimaestro/logs/daemon-out.log"
	echo "   tail -f ~/.aimaestro/logs/daemon-error.log"
	echo ""
	echo "🔄 Manage daemon:"
	echo "   sudo launchctl bootout system /Library/LaunchDaemons/com.aimaestro.daemon.plist  (stop)"
	echo "   sudo launchctl bootstrap system /Library/LaunchDaemons/com.aimaestro.daemon.plist  (start)"
else
	echo "❌ Daemon failed to start - check logs"
	exit 1
fi
