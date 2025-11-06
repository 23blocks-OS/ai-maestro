# Nginx configuration for AI Maestro Agent
# WebSocket proxy with SSL termination

upstream agent_backend {
    server 127.0.0.1:23000;
}

# HTTP server - redirect to HTTPS
server {
    listen 80;
    server_name ${domain_name};

    # Let's Encrypt ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all other HTTP traffic to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS server - WebSocket proxy
server {
    listen 443 ssl http2;
    server_name ${domain_name};

    # SSL certificates (will be configured by certbot)
    ssl_certificate /etc/letsencrypt/live/${domain_name}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain_name}/privkey.pem;

    # SSL configuration (Mozilla Intermediate)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # WebSocket proxy
    location /term {
        proxy_pass http://agent_backend;
        proxy_http_version 1.1;

        # WebSocket upgrade headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for long-lived connections
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_connect_timeout 60s;

        # Buffering (disable for WebSocket)
        proxy_buffering off;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://agent_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # Root - simple status page
    location / {
        return 200 "AI Maestro Agent - ${agent_name}\nStatus: Running\nWebSocket: wss://${domain_name}/term\n";
        add_header Content-Type text/plain;
    }
}
