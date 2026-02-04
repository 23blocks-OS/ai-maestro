#!/bin/bash
#
# AMP Agent Registration Tool
#
# Registers an external agent with an AI Maestro provider.
# This script handles keypair generation, registration, and config storage.
#
# Usage:
#   amp-register.sh [options]
#
# Options:
#   -n, --name NAME         Agent name (required)
#   -p, --provider URL      Provider URL (default: http://localhost:23000)
#   -t, --tenant TENANT     Tenant name (default: derived from provider hostname)
#   -d, --directory DIR     Config directory (default: ~/.agent-messaging)
#   -h, --help              Show this help message
#
# Example:
#   amp-register.sh --name my-agent --provider http://192.168.1.10:23000
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
PROVIDER_URL="http://localhost:23000"
CONFIG_DIR="$HOME/.agent-messaging"
AGENT_NAME=""
TENANT=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -n|--name)
      AGENT_NAME="$2"
      shift 2
      ;;
    -p|--provider)
      PROVIDER_URL="$2"
      shift 2
      ;;
    -t|--tenant)
      TENANT="$2"
      shift 2
      ;;
    -d|--directory)
      CONFIG_DIR="$2"
      shift 2
      ;;
    -h|--help)
      echo "AMP Agent Registration Tool"
      echo ""
      echo "Usage: amp-register.sh [options]"
      echo ""
      echo "Options:"
      echo "  -n, --name NAME         Agent name (required)"
      echo "  -p, --provider URL      Provider URL (default: http://localhost:23000)"
      echo "  -t, --tenant TENANT     Tenant name (default: derived from provider)"
      echo "  -d, --directory DIR     Config directory (default: ~/.agent-messaging)"
      echo "  -h, --help              Show this help message"
      echo ""
      echo "Example:"
      echo "  amp-register.sh --name my-agent --provider http://192.168.1.10:23000"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Validate required arguments
if [ -z "$AGENT_NAME" ]; then
  echo -e "${RED}Error: Agent name is required${NC}"
  echo "Usage: amp-register.sh --name <agent-name> [--provider <url>]"
  exit 1
fi

# Validate agent name format
if ! [[ "$AGENT_NAME" =~ ^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$ ]]; then
  echo -e "${RED}Error: Agent name must be lowercase alphanumeric with optional hyphens${NC}"
  echo "Valid examples: my-agent, agent1, test-agent-2"
  exit 1
fi

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           AMP Agent Registration Tool                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Discover provider
echo -e "${YELLOW}[1/5]${NC} Discovering provider at ${PROVIDER_URL}..."

DISCOVERY_URL="${PROVIDER_URL}/.well-known/agent-messaging.json"
DISCOVERY_RESPONSE=$(curl -s -f "$DISCOVERY_URL" 2>/dev/null || echo "")

if [ -z "$DISCOVERY_RESPONSE" ]; then
  # Try the /api/v1/info endpoint as fallback
  INFO_URL="${PROVIDER_URL}/api/v1/info"
  DISCOVERY_RESPONSE=$(curl -s -f "$INFO_URL" 2>/dev/null || echo "")

  if [ -z "$DISCOVERY_RESPONSE" ]; then
    echo -e "${RED}Error: Could not discover provider at ${PROVIDER_URL}${NC}"
    echo "Make sure the AI Maestro server is running and accessible."
    exit 1
  fi
fi

PROVIDER_NAME=$(echo "$DISCOVERY_RESPONSE" | grep -o '"provider"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"provider"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
API_ENDPOINT=$(echo "$DISCOVERY_RESPONSE" | grep -o '"endpoint"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"endpoint"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

if [ -z "$API_ENDPOINT" ]; then
  API_ENDPOINT="${PROVIDER_URL}/api/v1"
fi

echo -e "  ${GREEN}✓${NC} Provider: ${PROVIDER_NAME:-unknown}"
echo -e "  ${GREEN}✓${NC} Endpoint: ${API_ENDPOINT}"

# Derive tenant from provider if not specified
if [ -z "$TENANT" ]; then
  # Extract hostname from provider name or URL
  if [ -n "$PROVIDER_NAME" ]; then
    TENANT=$(echo "$PROVIDER_NAME" | sed 's/\.aimaestro\.local$//' | sed 's/\..*//')
  else
    TENANT=$(echo "$PROVIDER_URL" | sed 's|https\?://||' | sed 's|:.*||' | sed 's|/.*||')
  fi

  if [ -z "$TENANT" ] || [ "$TENANT" = "localhost" ]; then
    TENANT=$(hostname | tr '[:upper:]' '[:lower:]' | sed 's/\.local$//')
  fi
fi

echo -e "  ${GREEN}✓${NC} Tenant: ${TENANT}"
echo ""

# Step 2: Create config directory
echo -e "${YELLOW}[2/5]${NC} Setting up config directory..."

AGENT_DIR="${CONFIG_DIR}/agents/${AGENT_NAME}"
KEYS_DIR="${AGENT_DIR}/keys"

if [ -d "$AGENT_DIR" ]; then
  echo -e "${YELLOW}Warning: Agent directory already exists at ${AGENT_DIR}${NC}"
  read -p "Overwrite existing configuration? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
  rm -rf "$AGENT_DIR"
fi

mkdir -p "$KEYS_DIR"
chmod 700 "$KEYS_DIR"
echo -e "  ${GREEN}✓${NC} Created ${AGENT_DIR}"
echo ""

# Step 3: Generate Ed25519 keypair
echo -e "${YELLOW}[3/5]${NC} Generating Ed25519 keypair..."

PRIVATE_KEY_FILE="${KEYS_DIR}/private.pem"
PUBLIC_KEY_FILE="${KEYS_DIR}/public.pem"

# Generate private key
openssl genpkey -algorithm Ed25519 -out "$PRIVATE_KEY_FILE" 2>/dev/null
chmod 600 "$PRIVATE_KEY_FILE"

# Extract public key
openssl pkey -in "$PRIVATE_KEY_FILE" -pubout -out "$PUBLIC_KEY_FILE" 2>/dev/null
chmod 644 "$PUBLIC_KEY_FILE"

# Calculate fingerprint
FINGERPRINT=$(openssl pkey -in "$PRIVATE_KEY_FILE" -pubout -outform DER 2>/dev/null | tail -c 32 | openssl dgst -sha256 -binary | base64)

echo -e "  ${GREEN}✓${NC} Private key: ${PRIVATE_KEY_FILE}"
echo -e "  ${GREEN}✓${NC} Public key: ${PUBLIC_KEY_FILE}"
echo -e "  ${GREEN}✓${NC} Fingerprint: SHA256:${FINGERPRINT}"
echo ""

# Step 4: Register with provider
echo -e "${YELLOW}[4/5]${NC} Registering with provider..."

PUBLIC_KEY_PEM=$(cat "$PUBLIC_KEY_FILE")

# Build registration request
REGISTER_BODY=$(cat <<EOF
{
  "tenant": "${TENANT}",
  "name": "${AGENT_NAME}",
  "public_key": $(echo "$PUBLIC_KEY_PEM" | jq -Rs .),
  "key_algorithm": "Ed25519",
  "metadata": {
    "registered_via": "amp-register.sh",
    "registered_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  }
}
EOF
)

REGISTER_URL="${API_ENDPOINT}/register"
REGISTER_RESPONSE=$(curl -s -X POST "$REGISTER_URL" \
  -H "Content-Type: application/json" \
  -d "$REGISTER_BODY" 2>/dev/null)

# Check for errors
if echo "$REGISTER_RESPONSE" | grep -q '"error"'; then
  ERROR_MSG=$(echo "$REGISTER_RESPONSE" | grep -o '"message"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"message"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
  echo -e "${RED}Error: Registration failed${NC}"
  echo -e "${RED}${ERROR_MSG}${NC}"

  # Check for suggestions
  if echo "$REGISTER_RESPONSE" | grep -q '"suggestions"'; then
    echo ""
    echo "Suggested alternative names:"
    echo "$REGISTER_RESPONSE" | grep -o '"suggestions"[[:space:]]*:[[:space:]]*\[[^]]*\]' | sed 's/.*\[\(.*\)\].*/\1/' | tr ',' '\n' | sed 's/"//g' | sed 's/^ */  - /'
  fi

  rm -rf "$AGENT_DIR"
  exit 1
fi

# Extract response fields
AMP_ADDRESS=$(echo "$REGISTER_RESPONSE" | grep -o '"address"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"address"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
API_KEY=$(echo "$REGISTER_RESPONSE" | grep -o '"api_key"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"api_key"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
AGENT_ID=$(echo "$REGISTER_RESPONSE" | grep -o '"agent_id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"agent_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

if [ -z "$API_KEY" ]; then
  echo -e "${RED}Error: No API key received${NC}"
  echo "$REGISTER_RESPONSE"
  rm -rf "$AGENT_DIR"
  exit 1
fi

echo -e "  ${GREEN}✓${NC} Address: ${AMP_ADDRESS}"
echo -e "  ${GREEN}✓${NC} Agent ID: ${AGENT_ID}"
echo ""

# Step 5: Save configuration
echo -e "${YELLOW}[5/5]${NC} Saving configuration..."

CONFIG_FILE="${AGENT_DIR}/config.json"
cat > "$CONFIG_FILE" <<EOF
{
  "agent_name": "${AGENT_NAME}",
  "agent_id": "${AGENT_ID}",
  "address": "${AMP_ADDRESS}",
  "tenant": "${TENANT}",
  "provider": {
    "name": "${PROVIDER_NAME}",
    "endpoint": "${API_ENDPOINT}"
  },
  "fingerprint": "SHA256:${FINGERPRINT}",
  "registered_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
chmod 600 "$CONFIG_FILE"

# Save API key separately (more secure)
API_KEY_FILE="${AGENT_DIR}/api_key"
echo "$API_KEY" > "$API_KEY_FILE"
chmod 600 "$API_KEY_FILE"

echo -e "  ${GREEN}✓${NC} Config: ${CONFIG_FILE}"
echo -e "  ${GREEN}✓${NC} API Key: ${API_KEY_FILE}"
echo ""

# Success!
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Registration Complete!                           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLUE}Address:${NC}  ${AMP_ADDRESS}"
echo -e "  ${BLUE}API Key:${NC}  ${API_KEY:0:20}... (saved to ${API_KEY_FILE})"
echo ""
echo -e "${YELLOW}Important:${NC} The API key is shown only once. Keep it secure!"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo "  # Send a message"
echo "  curl -X POST ${API_ENDPOINT}/route \\"
echo "    -H \"Authorization: Bearer \$(cat ${API_KEY_FILE})\" \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    -d '{\"to\": \"recipient@${TENANT}.aimaestro.local\", \"subject\": \"Hello\", \"payload\": {\"type\": \"request\", \"message\": \"Hi!\"}}'"
echo ""
echo "  # Check for messages"
echo "  curl ${API_ENDPOINT}/messages/pending \\"
echo "    -H \"Authorization: Bearer \$(cat ${API_KEY_FILE})\""
echo ""
