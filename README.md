# Webot - Timezone-Aware Meeting Scheduler Discord Bot

A comprehensive Discord bot for scheduling meetings across different timezones, designed for distributed development teams and gaming communities.

## Features

### 🚀 Core Features
- **Timezone-aware meeting scheduling** with automatic conversions
- **Interactive voting system** for meeting availability
- **Recurring meeting support** with templates
- **Smart notification system** with customizable reminders
- **Availability management** for team members
- **Quick polls** for fast team decisions
- **Meeting analytics** and insights
- **Gamification** with points and achievements

### 📅 Meeting Management
- `/propose-meeting` - Create timezone-aware meeting proposals
- `/schedule-recurring` - Set up recurring meeting series
- `/meeting-notes` - Create collaborative note threads
- Interactive voting with ✅ Available, ❓ Maybe, ❌ Unavailable buttons

### ⏰ Availability System
- `/set-busy` - Mark yourself as unavailable for specific periods
- `/set-availability` - Configure working hours and timezone preferences
- `/team-availability` - View team availability with visual heatmaps
- Automatic conflict detection and suggestions

### 🔔 Notifications
- Automated reminders: 24h, 1h, 15m before meetings
- Timezone-aware notification delivery
- Customizable notification preferences
- Meeting confirmation and cancellation alerts

### 📊 Analytics & Insights
- `/meeting-stats` - Personal and team meeting statistics
- Response time tracking and leaderboards
- Meeting success rate analysis
- Optimal time suggestions based on team patterns

### 🎮 Gamification
- Points system for participation and organization
- Achievements: Time Lord, Early Bird, Meeting Master, etc.
- Leaderboards for most organized and responsive members

## Installation

### Prerequisites
- Node.js 18.0.0 or higher
- Discord Bot Token
- Discord Application ID

### Quick Setup

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd webot
npm install
```

2. **Set up environment variables:**
```bash
cp .env.example .env
```

Edit `.env` with your Discord bot credentials:
```env
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
DATABASE_URL=./data/webot.db
```

3. **Start the bot:**
```bash
npm start
```

For development:
```bash
npm run dev
```

### Discord Bot Setup

1. **Create Discord Application:**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application" and give it a name
   - Go to "Bot" section and click "Add Bot"
   - Copy the bot token for your `.env` file

2. **Set Bot Permissions:**
   Required permissions:
   - Send Messages
   - Use Slash Commands
   - Create Public Threads
   - Embed Links
   - Read Message History

3. **Invite Bot to Server:**
   - Go to "OAuth2" > "URL Generator"
   - Select "bot" and "applications.commands" scopes
   - Select required permissions
   - Use generated URL to invite bot to your server

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DISCORD_TOKEN` | Discord bot token | Required |
| `DISCORD_CLIENT_ID` | Discord application ID | Required |
| `DATABASE_URL` | SQLite database path | `./data/webot.db` |
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port for webhooks | `3000` |
| `DEFAULT_REMINDER_TIMES` | Default notification times | `24h,1h,15m` |

### Meeting Templates

The bot includes pre-configured templates for common meeting types:

- **Daily Standup** (30 min) - Quick team sync
- **Sprint Planning** (2 hours) - Sprint goal planning
- **Code Review** (1 hour) - Code review sessions
- **Retrospective** (90 min) - Sprint reflection
- **Gaming Session** (2 hours) - Fun team gaming
- **One-on-One** (30 min) - Private discussions
- **All Hands** (1 hour) - Company-wide meetings
- **Brainstorming** (90 min) - Creative sessions

## Usage Guide

### Basic Meeting Creation

```
/propose-meeting title:"Sprint Planning" date:"2024-12-25" time:"14:00" timezone:"Europe/Helsinki"
```

### Using Templates

```
/propose-meeting title:"Daily Standup" template:"standup" date:"2024-12-26" time:"09:00" timezone:"UTC"
```

### Setting Availability

```
/set-availability timezone:"Europe/Helsinki" start-hour:9 end-hour:17
/set-busy start-date:"2024-12-25" start-time:"10:00" end-date:"2024-12-25" end-time:"12:00" reason:"Doctor appointment"
```

### Viewing Team Availability

```
/team-availability start-date:"2024-12-23"
```

### Creating Quick Polls

```
/quick-poll question:"What should we work on next?" options:"Feature A; Bug fixes; Documentation; Testing" timeout:30
```

## API & Integrations

### Webhook Support (Optional)

Enable webhooks in `.env`:
```env
ENABLE_WEBHOOKS=true
PORT=3000
```

Webhook endpoints:
- `POST /webhooks/calendar` - Calendar integration
- `POST /webhooks/github` - GitHub PR notifications

### Calendar Export

Meetings can be exported as .ics calendar files for integration with:
- Google Calendar
- Outlook
- Apple Calendar
- Any CalDAV-compatible calendar

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm test -- --coverage
```

### Code Quality

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

### Database

The bot uses SQLite for data persistence. Database schema includes:
- Users (profiles, timezones, preferences)
- Meetings (proposals, responses, recurring patterns)
- Availability (busy periods, working hours)
- Notifications (scheduled reminders)
- Analytics (response times, participation stats)

## Deployment

### Production Setup

1. **Environment Configuration:**
```env
NODE_ENV=production
LOG_LEVEL=warn
```

2. **Process Management with PM2:**
```bash
npm install -g pm2
pm2 start ecosystem.config.js
```

3. **Docker Deployment:**
```bash
docker build -t webot .
docker run -d --name webot -v $(pwd)/data:/app/data webot
```

### Systemd Service

```bash
sudo cp scripts/webot.service /etc/systemd/system/
sudo systemctl enable webot
sudo systemctl start webot
```

## Troubleshooting

### Common Issues

**Bot not responding to commands:**
- Verify bot token and permissions
- Check if bot is online in Discord
- Ensure slash commands are registered

**Database errors:**
- Check database file permissions
- Verify SQLite installation
- Check disk space

**Timezone issues:**
- Verify timezone names using IANA format
- Check system timezone configuration
- Update timezone data if needed

### Debug Mode

Enable detailed logging:
```env
LOG_LEVEL=debug
NODE_ENV=development
```

### Support

For issues and feature requests:
- Check existing issues in the repository
- Create detailed bug reports with logs
- Include environment information

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

### Code Standards

- Follow ESLint configuration
- Write tests for new features
- Use conventional commit messages
- Update documentation as needed

## License

This project is licensed under the ISC License - see the LICENSE file for details.

## Acknowledgments

- Built with Discord.js
- Timezone handling by date-fns-tz
- Scheduling powered by node-cron
- Database management with SQLite3