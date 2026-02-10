#!/usr/bin/env bash
#
# AI Maestro Agent CLI Installer
#
# Installs aimaestro-agent.sh and the ai-maestro-agents-management skill
#
# Features:
#   - Zero user interaction required
#   - Idempotent (safe to run multiple times)
#   - Complete uninstall option
#   - Handles partial/corrupted installations
#   - Signal-safe (SIGTERM, SIGINT)
#   - Installs Claude Code skill for agent management
#
# Supported platforms: macOS, Linux (requires tmux)
#
# Usage:
#   ./install-agent-cli.sh              # Install
#   ./install-agent-cli.sh --uninstall  # Uninstall
#   ./install-agent-cli.sh --status     # Check installation status
#   ./install-agent-cli.sh --repair     # Repair corrupted installation
#
# Version: 1.0.2
#

set -euo pipefail

# ============================================================================
# Constants
# ============================================================================

INSTALLER_VERSION="1.0.2"
MANIFEST_FILENAME=".aimaestro-agent-cli-bash-manifest.json"

# Validate HOME is set and non-empty
if [[ -z "${HOME:-}" ]]; then
    echo "[ERROR] HOME environment variable is not set" >&2
    exit 1
fi

if [[ ! -d "$HOME" ]]; then
    echo "[ERROR] HOME directory does not exist: $HOME" >&2
    exit 1
fi

# Directories
INSTALL_DIR="${HOME}/.local/bin"
HELPERS_DIR="${HOME}/.local/share/aimaestro/shell-helpers"
MANIFEST_DIR="${HOME}/.local/share/aimaestro"

# Files to install
INSTALLED_FILES=(
    "aimaestro-agent.sh"
    "agent-helper.sh"
)

# Colors (with terminal check)
if [[ -t 1 ]] && [[ -n "${TERM:-}" ]] && [[ "$TERM" != "dumb" ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

# ============================================================================
# Utility Functions
# ============================================================================

# Print functions - properly quote arguments to prevent word splitting
print_error() { printf '%b[ERROR]%b %s\n' "${RED}" "${NC}" "${1:-}" >&2; }
print_success() { printf '%b[OK]%b %s\n' "${GREEN}" "${NC}" "${1:-}"; }
print_warning() { printf '%b[WARN]%b %s\n' "${YELLOW}" "${NC}" "${1:-}"; }
print_info() { printf '%b[INFO]%b %s\n' "${BLUE}" "${NC}" "${1:-}"; }

# Check dependencies - jq is REQUIRED for manifest handling
check_dependencies() {
    # curl is optional but recommended
    if ! command -v curl >/dev/null 2>&1; then
        print_warning "curl not found (optional - needed for some CLI features)"
    fi
    
    # jq is REQUIRED for manifest handling
    if ! command -v jq >/dev/null 2>&1; then
        print_error "jq is required but not found"
        print_info "Install jq: brew install jq (macOS) or apt-get install jq (Linux)"
        return 1
    fi
    
    return 0
}

# Find script directory
get_script_dir() {
    local dir
    dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" || {
        print_error "Could not determine script directory"
        exit 1
    }
    printf '%s' "$dir"
}

# Get shell config file
get_shell_config_file() {
    local shell="${SHELL:-}"

    if [[ "$shell" == *"zsh"* ]]; then
        if [[ -f "${HOME}/.zshrc" ]]; then
            printf '%s' "${HOME}/.zshrc"
        else
            printf '%s' "${HOME}/.zprofile"
        fi
    elif [[ "$shell" == *"bash"* ]]; then
        if [[ -f "${HOME}/.bashrc" ]]; then
            printf '%s' "${HOME}/.bashrc"
        elif [[ -f "${HOME}/.bash_profile" ]]; then
            printf '%s' "${HOME}/.bash_profile"
        else
            printf '%s' "${HOME}/.bashrc"
        fi
    else
        printf '%s' "${HOME}/.profile"
    fi
}

# Check if directory is in PATH
is_in_path() {
    local dir="$1"
    [[ ":${PATH}:" == *":${dir}:"* ]]
}

# Load manifest - with validation
load_manifest() {
    local manifest_path="${MANIFEST_DIR}/${MANIFEST_FILENAME}"
    if [[ -f "$manifest_path" ]]; then
        local content
        content="$(cat "$manifest_path" 2>/dev/null)" || {
            print_warning "Failed to read manifest file"
            printf '{}'
            return
        }
        # Validate it's valid JSON
        if printf '%s' "$content" | jq -e . >/dev/null 2>&1; then
            printf '%s' "$content"
        else
            print_warning "Manifest file is corrupted"
            printf '{}'
        fi
    else
        printf '{}'
    fi
}

# Save manifest atomically (write to temp file, then move)
save_manifest() {
    local manifest="$1"
    local manifest_path="${MANIFEST_DIR}/${MANIFEST_FILENAME}"
    local tmp_file

    mkdir -p "$MANIFEST_DIR" || {
        print_error "Failed to create manifest directory"
        return 1
    }

    # Write to temp file first for atomicity
    tmp_file="${manifest_path}.tmp.$$"
    if ! printf '%s\n' "$manifest" > "$tmp_file"; then
        print_error "Failed to write manifest temp file"
        rm -f "$tmp_file" 2>/dev/null
        return 1
    fi

    # Atomic move (rename is atomic on same filesystem)
    if ! mv -f "$tmp_file" "$manifest_path"; then
        print_error "Failed to save manifest"
        rm -f "$tmp_file" 2>/dev/null
        return 1
    fi
}

# ============================================================================
# Signal Handlers
# ============================================================================

STAGING_DIR=""

cleanup_staging() {
    if [[ -n "${STAGING_DIR:-}" ]] && [[ -d "$STAGING_DIR" ]]; then
        rm -rf "$STAGING_DIR" 2>/dev/null || true
    fi
}

signal_handler() {
    local signal="$1"
    echo ""
    print_warning "Received $signal, cleaning up..."
    cleanup_staging
    # Use appropriate exit code based on signal
    case "$signal" in
        SIGINT)  exit 130 ;;
        SIGTERM) exit 143 ;;
        *)       exit 1 ;;
    esac
}

trap 'signal_handler SIGINT' SIGINT
trap 'signal_handler SIGTERM' SIGTERM
trap cleanup_staging EXIT

# ============================================================================
# Installation
# ============================================================================

cmd_install() {
    local script_dir
    script_dir="$(get_script_dir)"

    echo ""
    echo "============================================================"
    echo "  AI Maestro Agent CLI Installer (Bash)"
    echo "============================================================"
    echo ""
    echo "  Platform:  $(uname -s)"
    echo "  Shell:     ${SHELL:-unknown}"
    echo "  Installer: v${INSTALLER_VERSION}"
    echo ""

    # Check dependencies first (jq is required)
    if ! check_dependencies; then
        return 1
    fi

    # Find source files
    local source_dir=""
    if [[ -f "${script_dir}/plugin/plugins/ai-maestro/scripts/aimaestro-agent.sh" ]]; then
        source_dir="${script_dir}/plugin/plugins/ai-maestro/scripts"
    elif [[ -f "${script_dir}/plugin/scripts/aimaestro-agent.sh" ]]; then
        source_dir="${script_dir}/plugin/scripts"
    elif [[ -f "${script_dir}/aimaestro-agent.sh" ]]; then
        source_dir="${script_dir}"
    else
        print_error "Could not find aimaestro-agent.sh"
        print_info "Run this installer from the AI Maestro directory"
        return 1
    fi

    echo "  Source:    ${source_dir}"
    echo "  Install:   ${INSTALL_DIR}"
    echo ""

    # Create staging directory with error handling
    STAGING_DIR="$(mktemp -d -t aimaestro-install-XXXXXX 2>/dev/null)" || {
        print_error "Failed to create staging directory"
        return 1
    }
    
    if [[ -z "$STAGING_DIR" ]] || [[ ! -d "$STAGING_DIR" ]]; then
        print_error "Staging directory creation failed"
        return 1
    fi

    # Stage files
    echo "Staging files..."
    cp "${source_dir}/aimaestro-agent.sh" "${STAGING_DIR}/" || {
        print_error "Failed to stage aimaestro-agent.sh"
        return 1
    }
    cp "${source_dir}/agent-helper.sh" "${STAGING_DIR}/" || {
        print_error "Failed to stage agent-helper.sh"
        return 1
    }
    print_success "Staged 2 files"
    echo ""

    # Create directories
    echo "Creating directories..."
    mkdir -p "$INSTALL_DIR" || {
        print_error "Failed to create install directory: $INSTALL_DIR"
        return 1
    }
    mkdir -p "$HELPERS_DIR" || {
        print_error "Failed to create helpers directory: $HELPERS_DIR"
        return 1
    }
    print_success "Directories created"
    echo ""

    # Install files
    echo "Installing files..."

    # Install main script
    cp "${STAGING_DIR}/aimaestro-agent.sh" "${INSTALL_DIR}/aimaestro-agent.sh" || {
        print_error "Failed to install aimaestro-agent.sh"
        return 1
    }
    chmod +x "${INSTALL_DIR}/aimaestro-agent.sh" || {
        print_error "Failed to set executable permission on aimaestro-agent.sh"
        return 1
    }
    print_success "${INSTALL_DIR}/aimaestro-agent.sh"

    # Create symlink without .sh extension for convenience
    ln -sf "aimaestro-agent.sh" "${INSTALL_DIR}/aimaestro-agent-bash" 2>/dev/null || {
        print_warning "Could not create convenience symlink (non-fatal)"
    }

    # Install helper
    cp "${STAGING_DIR}/agent-helper.sh" "${HELPERS_DIR}/agent-helper.sh" || {
        print_error "Failed to install agent-helper.sh"
        return 1
    }
    chmod +x "${HELPERS_DIR}/agent-helper.sh" || {
        print_error "Failed to set executable permission on agent-helper.sh"
        return 1
    }
    print_success "${HELPERS_DIR}/agent-helper.sh"
    echo ""

    # Configure PATH
    echo "Configuring PATH..."
    local path_modified="false"
    local shell_config=""

    if is_in_path "$INSTALL_DIR"; then
        print_success "$INSTALL_DIR already in PATH"
    else
        shell_config="$(get_shell_config_file)"

        # Check if already configured - use more specific pattern with word boundaries
        if [[ -f "$shell_config" ]] && grep -qE '#[[:space:]]*AI Maestro Agent CLI - Bash' "$shell_config" 2>/dev/null; then
            print_success "PATH already configured in $(basename "$shell_config")"
        else
            # Create backup before modifying
            if [[ -f "$shell_config" ]]; then
                cp "$shell_config" "${shell_config}.aimaestro-backup.$(date +%Y%m%d%H%M%S)" || {
                    print_warning "Could not create backup of shell config (continuing anyway)"
                }
            fi
            
            # Add to shell config
            {
                echo ""
                echo "# AI Maestro Agent CLI - Bash (added by installer)"
                echo "export PATH=\"${INSTALL_DIR}:\$PATH\""
            } >> "$shell_config" || {
                print_error "Failed to update shell config"
                return 1
            }

            path_modified=true
            print_success "Added to PATH in $shell_config"
        fi
    fi
    echo ""

    # Install Claude Code skill for agent management
    # This skill provides natural language interface for aimaestro-agent.sh commands
    echo "Installing Claude Code skill..."
    local skill_dir="${HOME}/.claude/skills/ai-maestro-agents-management"
    local skill_installed="false"

    if command -v claude &> /dev/null; then
        # Claude Code is installed, install the skill
        if ! mkdir -p "$skill_dir" 2>/dev/null; then
            print_warning "Could not create skill directory - skipping skill installation"
        else
            # Find the skill source file
            local skill_source=""
            if [[ -f "${script_dir}/plugin/plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md" ]]; then
                skill_source="${script_dir}/plugin/plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md"
            elif [[ -f "${script_dir}/plugin/skills/ai-maestro-agents-management/SKILL.md" ]]; then
                skill_source="${script_dir}/plugin/skills/ai-maestro-agents-management/SKILL.md"
            elif [[ -f "${source_dir}/../skills/ai-maestro-agents-management/SKILL.md" ]]; then
                skill_source="${source_dir}/../skills/ai-maestro-agents-management/SKILL.md"
            fi

            if [[ -n "$skill_source" ]] && [[ -f "$skill_source" ]]; then
                if cp "$skill_source" "${skill_dir}/SKILL.md" 2>/dev/null; then
                    print_success "Installed: ai-maestro-agents-management skill"
                    skill_installed="true"
                else
                    print_warning "Could not copy skill file"
                fi
            else
                print_warning "Skill source file not found - skipping skill installation"
            fi
        fi
    else
        print_info "Claude Code not found - skipping skill installation"
        print_info "Install Claude Code and re-run to get the skill"
    fi
    echo ""

    # Save manifest - use proper JSON boolean
    local manifest
    local path_modified_json="false"
    local skill_installed_json="false"
    if [[ "$path_modified" == "true" ]]; then
        path_modified_json="true"
    fi
    if [[ "$skill_installed" == "true" ]]; then
        skill_installed_json="true"
    fi

    manifest=$(jq -n \
        --arg version "$INSTALLER_VERSION" \
        --arg installed_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg platform "$(uname -s)" \
        --arg install_dir "$INSTALL_DIR" \
        --arg helpers_dir "$HELPERS_DIR" \
        --arg skill_dir "$skill_dir" \
        --argjson path_modified "$path_modified_json" \
        --argjson skill_installed "$skill_installed_json" \
        --arg shell_config "${shell_config:-}" \
        '{
            version: $version,
            installed_at: $installed_at,
            platform: $platform,
            install_dir: $install_dir,
            helpers_dir: $helpers_dir,
            skill_dir: $skill_dir,
            files: [
                ($install_dir + "/aimaestro-agent.sh"),
                ($helpers_dir + "/agent-helper.sh")
            ] + (if $skill_installed then [($skill_dir + "/SKILL.md")] else [] end),
            path_modified: $path_modified,
            skill_installed: $skill_installed,
            shell_config_file: $shell_config
        }') || {
        print_error "Failed to create manifest JSON"
        return 1
    }

    save_manifest "$manifest"

    # Cleanup staging
    cleanup_staging
    STAGING_DIR=""

    echo "============================================================"
    echo "  Installation Complete!"
    echo "============================================================"
    echo ""
    echo "  Usage:"
    echo "    aimaestro-agent.sh list"
    echo "    aimaestro-agent.sh show <agent>"
    echo "    aimaestro-agent.sh create <name>"
    echo ""

    if [[ "$path_modified" == "true" ]]; then
        echo "  To activate now, run:"
        echo "    source ${shell_config}"
        echo ""
    fi

    echo "  To uninstall:"
    echo "    ./install-agent-cli.sh --uninstall"
    echo ""
    echo "  For a full update (server + all tools):"
    echo "    ./update-aimaestro.sh"
    echo ""

    return 0
}

# ============================================================================
# Uninstall
# ============================================================================

cmd_uninstall() {
    echo ""
    echo "============================================================"
    echo "  AI Maestro Agent CLI Uninstaller (Bash)"
    echo "============================================================"
    echo ""

    # Check for jq (required for reading manifest)
    if ! command -v jq >/dev/null 2>&1; then
        print_warning "jq not found - will scan for files without manifest"
    fi

    local manifest
    manifest="$(load_manifest)"
    local files_removed=0

    # Remove installed files from manifest
    if [[ "$manifest" != "{}" ]] && command -v jq >/dev/null 2>&1; then
        echo "Removing installed files..."

        local files
        files=$(printf '%s' "$manifest" | jq -r '.files[]? // empty' 2>/dev/null) || files=""

        if [[ -n "$files" ]]; then

            while IFS= read -r file; do
                [[ -z "$file" ]] && continue
                # Security: Validate file path is within expected directories
                # Prevents manifest tampering from deleting arbitrary files
                case "$file" in
                    "${HOME}/.local/bin/"*|"${HOME}/.local/share/aimaestro/"*|"${HOME}/.claude/skills/"*)
                        if [[ -f "$file" ]]; then
                            if rm -f "$file"; then
                                echo "  [REMOVED] $file"
                                ((files_removed++)) || true
                            else
                                print_error "Failed to remove: $file"
                            fi
                        fi
                        ;;
                    *)
                        print_warning "Skipping file outside allowed paths: $file"
                        ;;
                esac
            done <<< "$files"
        fi

        # Remove symlink
        rm -f "${INSTALL_DIR}/aimaestro-agent-bash" 2>/dev/null || true
    else
        echo "No manifest found, scanning for files..."
    fi

    # Also check standard locations for files without manifest
    for filename in "${INSTALLED_FILES[@]}"; do
        local path="${INSTALL_DIR}/${filename}"
        if [[ -f "$path" ]]; then
            if rm -f "$path"; then
                echo "  [REMOVED] $path"
                ((files_removed++)) || true
            fi
        fi

        path="${HELPERS_DIR}/${filename}"
        if [[ -f "$path" ]]; then
            if rm -f "$path"; then
                echo "  [REMOVED] $path"
                ((files_removed++)) || true
            fi
        fi
    done

    # Clean shell config
    local shell_config=""
    local path_modified="false"
    
    if command -v jq >/dev/null 2>&1 && [[ "$manifest" != "{}" ]]; then
        shell_config=$(printf '%s' "$manifest" | jq -r '.shell_config_file // empty' 2>/dev/null) || shell_config=""
        path_modified=$(printf '%s' "$manifest" | jq -r '.path_modified // false' 2>/dev/null) || path_modified="false"
    fi

    if [[ "$path_modified" == "true" ]] && [[ -n "$shell_config" ]] && [[ -f "$shell_config" ]]; then
        echo ""
        echo "Cleaning up shell configuration..."

        # Create backup before modifying
        cp "$shell_config" "${shell_config}.aimaestro-uninstall-backup.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true

        # Create temp file safely
        local tmp_file
        tmp_file=$(mktemp) || {
            print_error "Failed to create temp file for shell config cleanup"
            # Continue without cleaning shell config
            tmp_file=""
        }
        
        if [[ -n "$tmp_file" ]]; then
            # Remove our PATH block (the Bash version marker)
            # Use grep -v to filter out our lines, handle empty result gracefully
            if grep -vE '#[[:space:]]*AI Maestro Agent CLI - Bash' "$shell_config" 2>/dev/null > "$tmp_file"; then
                # Also remove the export PATH line that follows our comment
                if [[ "$(uname -s)" == "Darwin" ]]; then
                    # macOS BSD sed
                    sed -i '' '/^export PATH=.*\.local\/bin.*:\$PATH/d' "$tmp_file" 2>/dev/null || true
                else
                    # GNU sed
                    sed -i '/^export PATH=.*\.local\/bin.*:\$PATH/d' "$tmp_file" 2>/dev/null || true
                fi
                
                # Only move if tmp_file has content or original was small
                if [[ -s "$tmp_file" ]] || [[ ! -s "$shell_config" ]]; then
                    mv "$tmp_file" "$shell_config" && print_success "Cleaned $shell_config"
                else
                    print_warning "Shell config cleanup produced empty file, keeping original"
                    rm -f "$tmp_file" 2>/dev/null || true
                fi
            else
                # grep failed (no matches or error) - file might not have our lines
                rm -f "$tmp_file" 2>/dev/null || true
                print_info "No AI Maestro entries found in shell config"
            fi
        fi
    fi

    # Remove skill directory
    local skill_dir="${HOME}/.claude/skills/ai-maestro-agents-management"
    if [[ -d "$skill_dir" ]]; then
        echo ""
        echo "Removing Claude Code skill..."
        rm -rf "$skill_dir" && echo "  [REMOVED] $skill_dir" || print_warning "Could not remove skill directory"
    fi

    # Remove manifest
    local manifest_path="${MANIFEST_DIR}/${MANIFEST_FILENAME}"
    if [[ -f "$manifest_path" ]]; then
        rm -f "$manifest_path"
        echo "  [REMOVED] $manifest_path"
    fi

    # Try to remove empty directories
    rmdir "$HELPERS_DIR" 2>/dev/null || true
    rmdir "${HELPERS_DIR%/*}" 2>/dev/null || true

    echo ""
    echo "============================================================"
    echo "  Uninstall Complete! ($files_removed files removed)"
    echo "============================================================"
    echo ""

    return 0
}

# ============================================================================
# Status
# ============================================================================

cmd_status() {
    echo ""
    echo "============================================================"
    echo "  AI Maestro Agent CLI Status (Bash)"
    echo "============================================================"
    echo ""

    # Check for jq
    if ! command -v jq >/dev/null 2>&1; then
        print_warning "jq not found - limited status information available"
        echo ""
    fi

    local manifest
    manifest="$(load_manifest)"

    if [[ "$manifest" != "{}" ]] && command -v jq >/dev/null 2>&1; then
        local version installed_at platform_name install_dir
        version=$(printf '%s' "$manifest" | jq -r '.version // "unknown"') || version="unknown"
        installed_at=$(printf '%s' "$manifest" | jq -r '.installed_at // "unknown"') || installed_at="unknown"
        platform_name=$(printf '%s' "$manifest" | jq -r '.platform // "unknown"') || platform_name="unknown"
        install_dir=$(printf '%s' "$manifest" | jq -r '.install_dir // "unknown"') || install_dir="unknown"

        echo "  Installed:     Yes (v${version})"
        echo "  Installed at:  ${installed_at}"
        echo "  Platform:      ${platform_name}"
        echo "  Install dir:   ${install_dir}"
        echo ""

        echo "  Files:"
        local all_ok=true
        local files
        files=$(printf '%s' "$manifest" | jq -r '.files[]? // empty' 2>/dev/null) || files=""

        if [[ -n "$files" ]]; then
            while IFS= read -r file; do
            [[ -z "$file" ]] && continue
            if [[ -f "$file" ]]; then
                echo "    [OK] $file"
            else
                echo "    [MISSING] $file"
                all_ok=false
                fi
            done <<< "$files"
        fi

        echo ""
        if [[ "$all_ok" == "true" ]]; then
            echo "  Status: OK"
        else
            echo "  Status: CORRUPTED (run --repair)"
        fi
    else
        echo "  Installed: No"
        echo ""

        # Check if files exist anyway
        local found=()
        for filename in "${INSTALLED_FILES[@]}"; do
            if [[ -f "${INSTALL_DIR}/${filename}" ]]; then
                found+=("${INSTALL_DIR}/${filename}")
            fi
            if [[ -f "${HELPERS_DIR}/${filename}" ]]; then
                found+=("${HELPERS_DIR}/${filename}")
            fi
        done

        if [[ ${#found[@]} -gt 0 ]]; then
            echo "  Found files without manifest:"
            for path in "${found[@]}"; do
                echo "    $path"
            done
            echo ""
            echo "  Status: PARTIAL (run --repair or --uninstall)"
        else
            echo "  Status: NOT INSTALLED"
        fi
    fi

    echo ""
    return 0
}

# ============================================================================
# Repair
# ============================================================================

cmd_repair() {
    echo ""
    echo "============================================================"
    echo "  AI Maestro Agent CLI Repair (Bash)"
    echo "============================================================"
    echo ""

    echo "Step 1: Removing existing installation..."
    cmd_uninstall

    echo ""
    echo "Step 2: Reinstalling..."
    cmd_install
}

# ============================================================================
# Help
# ============================================================================

cmd_help() {
    cat << 'EOF'
AI Maestro Agent CLI Installer (Bash Version)

Cross-platform installer for aimaestro-agent.sh

Usage:
    ./install-agent-cli.sh              # Install
    ./install-agent-cli.sh --uninstall  # Uninstall
    ./install-agent-cli.sh --status     # Check installation status
    ./install-agent-cli.sh --repair     # Repair corrupted installation
    ./install-agent-cli.sh --help       # Show this help
    ./install-agent-cli.sh --version    # Show version

The bash version installs:
    ~/.local/bin/aimaestro-agent.sh     # Main CLI script
    ~/.local/share/aimaestro/shell-helpers/agent-helper.sh  # Helper functions

Requirements:
    jq       # Required for manifest handling
    tmux     # Required for agent session management

Supported platforms: macOS, Linux (Windows users should use WSL)
EOF
}

# ============================================================================
# Main
# ============================================================================

main() {
    case "${1:-}" in
        --uninstall)
            cmd_uninstall
            ;;
        --status)
            cmd_status
            ;;
        --repair)
            cmd_repair
            ;;
        --help|-h)
            cmd_help
            ;;
        --version|-v)
            echo "AI Maestro Agent CLI Installer (Bash) v${INSTALLER_VERSION}"
            ;;
        # v0.21.26: Accept -y/--yes/--non-interactive for consistency.
        # This installer has no interactive prompts, so the flag is a no-op,
        # but accepting it prevents errors when called from install.sh -y.
        -y|--yes|--non-interactive)
            cmd_install
            ;;
        "")
            cmd_install
            ;;
        *)
            print_error "Unknown argument: $1"
            echo "Use --help for usage"
            exit 1
            ;;
    esac
}

main "$@"
