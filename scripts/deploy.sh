#!/bin/bash

# Webot Deployment Script
set -e

echo "🚀 Starting Webot deployment..."

# Configuration
APP_NAME="webot"
APP_DIR="/opt/webot"
SERVICE_NAME="webot.service"
BACKUP_DIR="/opt/webot-backups"
USER="webot"
GROUP="webot"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root"
   exit 1
fi

# Create user and group if they don't exist
if ! id "$USER" &>/dev/null; then
    log_info "Creating user $USER..."
    useradd -r -s /bin/false -d $APP_DIR $USER
fi

# Create directories
log_info "Creating directories..."
mkdir -p $APP_DIR
mkdir -p $BACKUP_DIR
mkdir -p $APP_DIR/data
mkdir -p $APP_DIR/logs

# Backup existing installation
if [ -d "$APP_DIR" ] && [ "$(ls -A $APP_DIR)" ]; then
    log_info "Creating backup..."
    BACKUP_FILE="$BACKUP_DIR/webot-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    tar -czf $BACKUP_FILE -C $APP_DIR . 2>/dev/null || log_warn "Backup creation failed"
fi

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    log_info "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi

# Install PM2 globally if not present
if ! command -v pm2 &> /dev/null; then
    log_info "Installing PM2..."
    npm install -g pm2
fi

# Copy application files
log_info "Copying application files..."
cp -r . $APP_DIR/
cd $APP_DIR

# Install dependencies
log_info "Installing dependencies..."
npm ci --only=production

# Set up environment file
if [ ! -f "$APP_DIR/.env" ]; then
    log_warn "No .env file found. Creating template..."
    cp .env.example .env
    log_info "Please edit $APP_DIR/.env with your configuration"
fi

# Set permissions
log_info "Setting permissions..."
chown -R $USER:$GROUP $APP_DIR
chmod +x $APP_DIR/scripts/*.sh

# Set up systemd service
log_info "Setting up systemd service..."
cp scripts/webot.service /etc/systemd/system/
systemctl daemon-reload

# Enable and start service
log_info "Starting Webot service..."
systemctl enable webot
systemctl restart webot

# Set up log rotation
log_info "Setting up log rotation..."
cat > /etc/logrotate.d/webot << EOF
$APP_DIR/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0644 $USER $GROUP
    postrotate
        systemctl reload webot || true
    endscript
}
EOF

# Set up automatic updates (optional)
log_info "Setting up automatic backup cron job..."
cat > /etc/cron.d/webot-backup << EOF
# Backup Webot data daily at 2 AM
0 2 * * * root /opt/webot/scripts/backup.sh
EOF

# Cleanup old backups
log_info "Setting up backup cleanup..."
cat > /etc/cron.d/webot-cleanup << EOF
# Clean up old backups weekly
0 3 * * 0 root find $BACKUP_DIR -name "webot-backup-*.tar.gz" -mtime +30 -delete
EOF

# Check service status
sleep 5
if systemctl is-active --quiet webot; then
    log_info "✅ Webot deployed successfully and is running!"
    log_info "📋 Service status: $(systemctl is-active webot)"
    log_info "📁 Application directory: $APP_DIR"
    log_info "📄 Logs: $APP_DIR/logs/"
    log_info "🔧 Service management:"
    log_info "   - Start: systemctl start webot"
    log_info "   - Stop: systemctl stop webot"
    log_info "   - Restart: systemctl restart webot"
    log_info "   - Status: systemctl status webot"
    log_info "   - Logs: journalctl -u webot -f"
else
    log_error "❌ Deployment failed. Check logs with: journalctl -u webot"
    exit 1
fi

echo
log_info "🎉 Deployment complete!"
log_warn "Don't forget to:"
log_warn "1. Configure your .env file: $APP_DIR/.env"
log_warn "2. Set up your Discord bot token and permissions"
log_warn "3. Invite the bot to your Discord server"