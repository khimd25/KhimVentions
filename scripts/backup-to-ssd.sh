#!/usr/bin/env bash
set -euo pipefail

#──────────────────────────────────────────────────────────────────────
# Backup Plan: Work Machine → 8TB External SSD
# Run on your local macOS machine with the SSD mounted.
#
# Usage:
#   chmod +x scripts/backup-to-ssd.sh
#   ./scripts/backup-to-ssd.sh [/Volumes/YourSSDName]
#
# If no argument is given, defaults to /Volumes/KhimBackup2026.
#──────────────────────────────────────────────────────────────────────

BACKUP_ROOT="${1:-/Volumes/KhimBackup2026}"
LOGFILE="$HOME/backup-$(date +%Y-%m-%d_%H%M%S).log"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $*" | tee -a "$LOGFILE"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*" | tee -a "$LOGFILE"; }
warn() { echo -e "${YELLOW}[!]${NC} $*" | tee -a "$LOGFILE"; }
fail() { echo -e "${RED}[✗]${NC} $*" | tee -a "$LOGFILE"; exit 1; }

elapsed() {
  local t=$SECONDS
  printf '%dh %dm %ds' $((t/3600)) $((t%3600/60)) $((t%60))
}

#──────────────────────────────────────────────────────────────────────
# Preflight checks
#──────────────────────────────────────────────────────────────────────
log "Backup target: $BACKUP_ROOT"
log "Log file:      $LOGFILE"

if [[ ! -d "$BACKUP_ROOT" ]] && [[ ! -d "$(dirname "$BACKUP_ROOT")" ]]; then
  fail "SSD not mounted or path doesn't exist: $BACKUP_ROOT"
fi

# Check available space on the target volume
if command -v df &>/dev/null; then
  avail=$(df -h "$BACKUP_ROOT" 2>/dev/null | tail -1 | awk '{print $4}')
  log "Available space on target: $avail"
fi

#──────────────────────────────────────────────────────────────────────
# Create directory structure
#──────────────────────────────────────────────────────────────────────
log "Creating directory structure..."
mkdir -p "$BACKUP_ROOT"/{projects,secrets-encrypted,configs,documents,desktop,misc}
ok "Directory structure ready"

#──────────────────────────────────────────────────────────────────────
# Common rsync exclusions
#──────────────────────────────────────────────────────────────────────
RSYNC_EXCLUDES=(
  --exclude='node_modules/'
  --exclude='.venv/'
  --exclude='build_env/'
  --exclude='caption_env/'
  --exclude='venv/'
  --exclude='dist/'
  --exclude='build/'
  --exclude='.next/'
  --exclude='.turbo/'
  --exclude='__pycache__/'
  --exclude='*.pyc'
  --exclude='.cache/'
  --exclude='.cargo/registry/'
  --exclude='.rustup/'
  --exclude='*.dmg'
)

#──────────────────────────────────────────────────────────────────────
# STEP 1: Secrets Archive (encrypted)
#──────────────────────────────────────────────────────────────────────
step1_secrets() {
  log "━━━ STEP 1/5: Secrets Archive (encrypted) ━━━"

  SECRETS_STAGE=$(mktemp -d)
  local cleanup_stage="$SECRETS_STAGE"

  # Collect .env files
  log "Collecting .env files..."
  while IFS= read -r f; do
    dest="$SECRETS_STAGE${f#$HOME}"
    mkdir -p "$(dirname "$dest")"
    cp "$f" "$dest" 2>/dev/null || true
  done < <(find "$HOME" -maxdepth 8 -name ".env*" \
    -not -path "*/node_modules/*" \
    -not -path "*/.venv/*" \
    -not -path "*/build_env/*" \
    -not -path "*/caption_env/*" \
    2>/dev/null || true)

  # SSH keys
  if [[ -d "$HOME/.ssh" ]]; then
    log "Collecting SSH keys..."
    cp -r "$HOME/.ssh" "$SECRETS_STAGE/.ssh"
  fi

  # Token/credential files
  log "Collecting credential files..."
  local cred_files=(
    "$HOME/.slack_mcp/.cache/slack_tokens.json"
    "$HOME/.config/gh/config.yml"
    "$HOME/.config/gh/hosts.yml"
    "$HOME/.cline/data/secrets.json"
    "$HOME/Library/Application Support/Claude/buddy-tokens.json"
    "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
    "$HOME/slack-mcp-config.json"
  )
  for f in "${cred_files[@]}"; do
    if [[ -e "$f" ]]; then
      dest="$SECRETS_STAGE${f#$HOME}"
      mkdir -p "$(dirname "$dest")"
      cp "$f" "$dest"
    fi
  done

  # .anthropic directory
  if [[ -d "$HOME/.anthropic" ]]; then
    cp -r "$HOME/.anthropic" "$SECRETS_STAGE/.anthropic"
  fi

  # Count collected files
  local count
  count=$(find "$SECRETS_STAGE" -type f 2>/dev/null | wc -l | tr -d ' ')
  log "Collected $count secret files. Creating encrypted archive..."

  local archive="$BACKUP_ROOT/secrets-encrypted/secrets-$(date +%Y-%m-%d).zip"
  zip -er "$archive" "$SECRETS_STAGE"

  ok "Secrets archive created: $archive"
  warn "KEEP THE PASSWORD SAFE — you'll need it to restore."

  rm -rf "$cleanup_stage"
}

#──────────────────────────────────────────────────────────────────────
# STEP 2: Projects (rsync)
#──────────────────────────────────────────────────────────────────────
step2_projects() {
  log "━━━ STEP 2/5: Projects ━━━"

  local project_dirs=(
    "$HOME/afs-attach-dashboard"
    "$HOME/afs-build-ctx"
    "$HOME/AFS-Studio"
    "$HOME/anthropic-quickstarts"
    "$HOME/Apple-Style-MCP"
    "$HOME/AppleGeminiCLI"
    "$HOME/claude-code-marketplace"
    "$HOME/eol-tracking-dashboard"
    "$HOME/KhimTekken"
    "$HOME/mcp-ical"
    "$HOME/MeetingHarvester"
    "$HOME/MeetingRecap"
    "$HOME/pm-toolkit"
    "$HOME/python-mcp-env"
    "$HOME/quip-mcp-server"
    "$HOME/SlackMCP"
    "$HOME/wrike-mcp-server"
    "$HOME/.mcp-servers"
  )

  local synced=0 skipped=0
  for dir in "${project_dirs[@]}"; do
    if [[ -d "$dir" ]]; then
      log "Syncing $(basename "$dir")..."
      rsync -av --progress "${RSYNC_EXCLUDES[@]}" "$dir" "$BACKUP_ROOT/projects/" 2>&1 | tail -1 | tee -a "$LOGFILE"
      ((synced++))
    else
      warn "Skipping $(basename "$dir") — not found"
      ((skipped++))
    fi
  done

  ok "Projects done: $synced synced, $skipped skipped"
}

#──────────────────────────────────────────────────────────────────────
# STEP 2b: Documents & Desktop
#──────────────────────────────────────────────────────────────────────
step2b_documents() {
  log "━━━ STEP 2b/5: Documents & Desktop ━━━"

  if [[ -d "$HOME/Documents" ]]; then
    log "Syncing Documents (excluding Enchanté/Conversations)..."
    rsync -av --progress "${RSYNC_EXCLUDES[@]}" \
      --exclude='Enchanté/Conversations/' \
      "$HOME/Documents/" "$BACKUP_ROOT/documents/" 2>&1 | tail -1 | tee -a "$LOGFILE"
    ok "Documents synced"
  else
    warn "~/Documents not found, skipping"
  fi

  if [[ -d "$HOME/Desktop" ]]; then
    log "Syncing Desktop..."
    rsync -av --progress "${RSYNC_EXCLUDES[@]}" \
      "$HOME/Desktop/" "$BACKUP_ROOT/desktop/" 2>&1 | tail -1 | tee -a "$LOGFILE"
    ok "Desktop synced"
  else
    warn "~/Desktop not found, skipping"
  fi
}

#──────────────────────────────────────────────────────────────────────
# STEP 3: Configs and Dot-files
#──────────────────────────────────────────────────────────────────────
step3_configs() {
  log "━━━ STEP 3/5: Configs & Dot-files ━━━"

  # Claude Code config
  if [[ -d "$HOME/.claude" ]]; then
    log "Syncing .claude config..."
    rsync -av --progress \
      --exclude='apple/claude-proxy-shared-*.db' \
      "$HOME/.claude/" "$BACKUP_ROOT/configs/claude/" 2>&1 | tail -1 | tee -a "$LOGFILE"
  fi
  [[ -f "$HOME/.claude.json" ]]        && cp "$HOME/.claude.json"        "$BACKUP_ROOT/configs/"
  [[ -f "$HOME/.claude.json.backup" ]] && cp "$HOME/.claude.json.backup" "$BACKUP_ROOT/configs/"

  # Shell dot-files
  log "Copying shell configs..."
  for f in "$HOME/.zshrc" "$HOME/.zshenv" "$HOME/.zprofile" "$HOME/.zsh_history" \
           "$HOME/.gitconfig" "$HOME/.npmrc" "$HOME/.Brewfile"; do
    [[ -f "$f" ]] && cp "$f" "$BACKUP_ROOT/configs/"
  done

  # Kube, Docker, Vessel
  for d in .kube .docker .vessel; do
    if [[ -d "$HOME/$d" ]]; then
      log "Syncing $d..."
      rsync -av "$HOME/$d/" "$BACKUP_ROOT/configs/${d#.}/" 2>&1 | tail -1 | tee -a "$LOGFILE"
    fi
  done

  # ~/.config
  if [[ -d "$HOME/.config" ]]; then
    log "Syncing ~/.config..."
    rsync -av "$HOME/.config/" "$BACKUP_ROOT/configs/config/" 2>&1 | tail -1 | tee -a "$LOGFILE"
  fi

  # Slack MCP
  if [[ -d "$HOME/.slack_mcp" ]]; then
    rsync -av "$HOME/.slack_mcp/" "$BACKUP_ROOT/configs/slack_mcp/" 2>&1 | tail -1 | tee -a "$LOGFILE"
  fi

  # App Support: Claude Desktop
  local claude_app="$HOME/Library/Application Support/Claude"
  if [[ -d "$claude_app" ]]; then
    log "Syncing Claude Desktop app support..."
    rsync -av "$claude_app/" "$BACKUP_ROOT/configs/app-support-claude/" 2>&1 | tail -1 | tee -a "$LOGFILE"
  fi

  # Enchanté plist
  local plist="$HOME/Library/Preferences/com.apple.internal.enchante.plist"
  [[ -f "$plist" ]] && cp "$plist" "$BACKUP_ROOT/configs/"

  # Webex captions DB
  if [[ -d "$HOME/webex_captions" ]]; then
    log "Syncing webex_captions..."
    rsync -av "$HOME/webex_captions/" "$BACKUP_ROOT/configs/webex_captions/" 2>&1 | tail -1 | tee -a "$LOGFILE"
  fi

  ok "Configs done"
}

#──────────────────────────────────────────────────────────────────────
# STEP 4: Loose home-root files
#──────────────────────────────────────────────────────────────────────
step4_misc() {
  log "━━━ STEP 4/5: Misc loose files ━━━"

  local loose_files=(
    "$HOME/B2B_Team_Call_Script_Handoff.md"
    "$HOME/DEVELOPER-NOTES.md"
    "$HOME/Khim-AFS-CE-Keynote-Final.key"
    "$HOME/Khim-AFS-Director-Pitch.key"
    "$HOME/slack-mcp-config.json"
  )

  local copied=0
  for f in "${loose_files[@]}"; do
    if [[ -f "$f" ]]; then
      cp "$f" "$BACKUP_ROOT/misc/"
      ((copied++))
    fi
  done

  # Transcription files
  while IFS= read -r f; do
    cp "$f" "$BACKUP_ROOT/misc/" 2>/dev/null || true
  done < <(find "$HOME" -maxdepth 1 \( -name "*.srt" -o -name "*.vtt" -o -name "*.tsv" \) 2>/dev/null || true)

  ok "Misc files done ($copied loose files copied)"
}

#──────────────────────────────────────────────────────────────────────
# STEP 5: Verify
#──────────────────────────────────────────────────────────────────────
step5_verify() {
  log "━━━ STEP 5/5: Verification ━━━"

  log "Total backup size:"
  du -sh "$BACKUP_ROOT" | tee -a "$LOGFILE"

  echo "" | tee -a "$LOGFILE"
  log "Breakdown by directory:"
  du -sh "$BACKUP_ROOT"/*/ 2>/dev/null | tee -a "$LOGFILE"

  echo "" | tee -a "$LOGFILE"
  log "Secrets archive:"
  ls -lh "$BACKUP_ROOT/secrets-encrypted/" | tee -a "$LOGFILE"

  # Spot-check a git repo
  local test_repo="$BACKUP_ROOT/documents/AFS Projects/AFS Pricing Quote Web App_forKube"
  if [[ -d "$test_repo/.git" ]]; then
    echo "" | tee -a "$LOGFILE"
    log "Spot-check git repo:"
    git -C "$test_repo" log --oneline -5 2>&1 | tee -a "$LOGFILE"
  fi

  echo "" | tee -a "$LOGFILE"
  ok "Backup complete in $(elapsed)"
  log "Full log saved to: $LOGFILE"
}

#──────────────────────────────────────────────────────────────────────
# Main
#──────────────────────────────────────────────────────────────────────
main() {
  echo ""
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║        Khim's Work Machine → SSD Backup Script         ║"
  echo "╠══════════════════════════════════════════════════════════╣"
  echo "║  Target: $(printf '%-46s' "$BACKUP_ROOT") ║"
  echo "║  Date:   $(printf '%-46s' "$(date '+%Y-%m-%d %H:%M:%S')") ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo ""

  read -rp "Proceed with backup? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi

  SECONDS=0

  step1_secrets
  step2_projects
  step2b_documents
  step3_configs
  step4_misc
  step5_verify
}

main
