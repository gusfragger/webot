#!/bin/bash

# Webot Backup Script
set -e

# Configuration
APP_DIR="/opt/webot"
BACKUP_DIR="/opt/webot-backups"
RETENTION_DAYS=30

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Generate backup filename with timestamp
BACKUP_FILE="$BACKUP_DIR/webot-backup-$(date +%Y%m%d-%H%M%S).tar.gz"

log_info "Starting backup to $BACKUP_FILE..."

# Create backup
if tar -czf $BACKUP_FILE -C $APP_DIR data logs .env 2>/dev/null; then
    log_info "✅ Backup created successfully"

    # Show backup size
    BACKUP_SIZE=$(du -h $BACKUP_FILE | cut -f1)
    log_info "📦 Backup size: $BACKUP_SIZE"
else
    log_error "❌ Backup failed"
    exit 1
fi

# Clean up old backups
log_info "Cleaning up backups older than $RETENTION_DAYS days..."
OLD_BACKUPS=$(find $BACKUP_DIR -name "webot-backup-*.tar.gz" -mtime +$RETENTION_DAYS)

if [ -n "$OLD_BACKUPS" ]; then
    echo "$OLD_BACKUPS" | xargs rm -f
    CLEANED_COUNT=$(echo "$OLD_BACKUPS" | wc -l)
    log_info "🗑️  Removed $CLEANED_COUNT old backup(s)"
else
    log_info "No old backups to clean up"
fi

# Show current backup count
BACKUP_COUNT=$(find $BACKUP_DIR -name "webot-backup-*.tar.gz" | wc -l)
log_info "📊 Total backups: $BACKUP_COUNT"

log_info "🎉 Backup process completed!"