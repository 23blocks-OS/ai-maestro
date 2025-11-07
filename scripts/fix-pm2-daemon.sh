#!/bin/bash

# Fix PM2 network access by converting to system daemon
# This keeps full PM2 functionality while bypassing Local Network Privacy

set -e

echo "🔧 Converting PM2 to system daemon (keeps all PM2 features)..."
echo ""

# Get paths
PM2_PATH="/Users/juanpelaez/.nvm/versions/node/v20.19.0/bin/pm2"
NODE_PATH="/Users/juanpelaez/.nvm/versions/node/v20.19.0/bin/node"
USER_HOME="/Users/juanpelaez"

# Step 1: Remove existing user-level PM2 startup (if exists)
echo "Step 1: Checking for existing PM2 startup configuration..."
if [ -f "$USER_HOME/Library/LaunchAgents/pm2.juanpelaez.plist" ]; then
    echo "Found existing user agent, removing..."
    launchctl unload "$USER_HOME/Library/LaunchAgents/pm2.juanpelaez.plist" 2>/dev/null || true
    rm "$USER_HOME/Library/LaunchAgents/pm2.juanpelaez.plist"
    echo "✅ User agent removed"
else
    echo "✅ No existing user agent found"
fi
echo ""

# Step 2: Save current PM2 process list
echo "Step 2: Saving current PM2 process list..."
$PM2_PATH save
echo "✅ PM2 processes saved"
echo ""

# Step 3: Create system-level daemon plist that runs PM2
echo "Step 3: Creating system daemon plist..."
cat > /tmp/com.aimaestro.pm2.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>com.aimaestro.pm2</string>

	<key>UserName</key>
	<string>juanpelaez</string>

	<key>WorkingDirectory</key>
	<string>$USER_HOME</string>

	<key>ProgramArguments</key>
	<array>
		<string>$PM2_PATH</string>
		<string>resurrect</string>
	</array>

	<key>EnvironmentVariables</key>
	<dict>
		<key>PATH</key>
		<string>/Users/juanpelaez/.nvm/versions/node/v20.19.0/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
		<key>PM2_HOME</key>
		<string>$USER_HOME/.pm2</string>
	</dict>

	<key>RunAtLoad</key>
	<true/>

	<key>KeepAlive</key>
	<false/>

	<key>StandardOutPath</key>
	<string>$USER_HOME/.pm2/pm2-daemon-out.log</string>

	<key>StandardErrorPath</key>
	<string>$USER_HOME/.pm2/pm2-daemon-error.log</string>
</dict>
</plist>
EOF
echo "✅ Plist created"
echo ""

# Step 4: Install daemon plist
echo "Step 4: Installing daemon plist to /Library/LaunchDaemons..."
echo "This requires sudo password..."
sudo cp /tmp/com.aimaestro.pm2.plist /Library/LaunchDaemons/
sudo chown root:wheel /Library/LaunchDaemons/com.aimaestro.pm2.plist
sudo chmod 644 /Library/LaunchDaemons/com.aimaestro.pm2.plist
echo "✅ Daemon plist installed"
echo ""

# Step 5: Load the daemon
echo "Step 5: Loading system daemon (this starts PM2)..."
sudo launchctl bootstrap system /Library/LaunchDaemons/com.aimaestro.pm2.plist
echo "✅ Daemon loaded"
echo ""

# Step 6: Wait for PM2 to start
echo "Step 6: Waiting for PM2 to start..."
sleep 3
echo ""

# Step 7: Verify
echo "Step 7: Verifying PM2 is running..."
if $PM2_PATH list | grep -q "online"; then
	echo "✅ PM2 is running with applications!"
	echo ""
	$PM2_PATH list
	echo ""
	echo "🎉 SUCCESS! PM2 now runs as a system daemon with full functionality:"
	echo "   • pm2 list, pm2 logs, pm2 restart all work normally"
	echo "   • Network access works (exempt from Local Network Privacy)"
	echo "   • Auto-starts on boot"
	echo ""
	echo "📋 Useful commands:"
	echo "   pm2 list                    - View running processes"
	echo "   pm2 logs ai-maestro         - View logs"
	echo "   pm2 restart ai-maestro      - Restart app"
	echo ""
	echo "🔄 Manage daemon:"
	echo "   sudo launchctl bootout system /Library/LaunchDaemons/com.aimaestro.pm2.plist  (stop)"
	echo "   sudo launchctl bootstrap system /Library/LaunchDaemons/com.aimaestro.pm2.plist  (start)"
else
	echo "⚠️  PM2 started but no apps running yet"
	echo "Run: pm2 resurrect"
	echo ""
	echo "Check logs at: $USER_HOME/.pm2/pm2-daemon-*.log"
fi
