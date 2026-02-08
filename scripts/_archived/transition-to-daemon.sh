#!/bin/bash

echo "🔄 Transitioning from old PM2 to system daemon..."
echo ""

# Step 1: Save current processes
echo "Step 1: Saving PM2 process list..."
pm2 save
echo "✅ Saved"
echo ""

# Step 2: Kill old PM2 daemon completely
echo "Step 2: Killing old PM2 daemon (PID 27401 from October)..."
pm2 kill
echo "✅ Old PM2 daemon killed"
echo ""

# Step 3: Verify system daemon is loaded
echo "Step 3: Verifying system daemon status..."
if sudo launchctl list | grep -q com.aimaestro.pm2; then
    echo "✅ System daemon is loaded"
else
    echo "❌ System daemon not loaded! Loading now..."
    sudo launchctl bootstrap system /Library/LaunchDaemons/com.aimaestro.pm2.plist
fi
echo ""

# Step 4: Manually trigger daemon (it should auto-start, but let's be sure)
echo "Step 4: Starting PM2 via system daemon..."
/Users/juanpelaez/.nvm/versions/node/v20.19.0/bin/pm2 resurrect
echo ""

# Step 5: Wait for PM2 to start
echo "Step 5: Waiting for PM2 to initialize..."
sleep 3
echo ""

# Step 6: Verify
echo "Step 6: Verifying PM2 is running..."
pm2 list
echo ""

# Step 7: Check process parent
echo "Step 7: Checking PM2 daemon parent process..."
PM2_PID=$(ps aux | grep "PM2 v" | grep -v grep | awk '{print $2}')
if [ -n "$PM2_PID" ]; then
    echo "PM2 daemon PID: $PM2_PID"
    ps -p $PM2_PID -o pid,ppid,user,command
    echo ""
    PPID=$(ps -p $PM2_PID -o ppid= | tr -d ' ')
    echo "Parent process (PPID $PPID):"
    ps -p $PPID -o pid,ppid,user,command
    echo ""

    if [ "$PPID" = "1" ]; then
        echo "✅ PM2 daemon is now controlled by launchd (system daemon)"
    else
        echo "⚠️  PM2 daemon parent is not launchd - may still have issues"
    fi
fi
echo ""

echo "🎉 Transition complete! Testing network access..."
echo ""

# Test network access
echo "Testing connection to 10.0.0.18:23000..."
if curl -s -m 5 http://10.0.0.18:23000/api/hosts/identity > /dev/null; then
    echo "✅ Remote host is reachable!"
else
    echo "⚠️  Remote host not reachable - may need to wait or restart"
fi
