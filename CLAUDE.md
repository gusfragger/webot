# Webot Development Standards & Architecture Guide

## CODING STYLE

### JavaScript/Node.js Standards

```javascript
// Use modern ES6+ syntax with consistent formatting
const { Client, GatewayIntentBits } = require("discord.js");

// Prefer const/let over var, use arrow functions appropriately
const processCommand = async (interaction) => {
    // Implementation
};

// Use descriptive variable names
const proposedMeetingTime = interaction.options.getString("time");
const userTimezone = getUserTimezone(interaction.user.id);
```

### Formatting Rules

- **Indentation**: 2 spaces (no tabs)
- **Line length**: 80 characters max
- **Semicolons**: Always use them
- **Quotes**: Single quotes for strings, backticks for templates
- **Trailing commas**: Use in multi-line objects/arrays

### Naming Conventions

```javascript
// Constants: UPPER_SNAKE_CASE
const DEFAULT_MEETING_DURATION = 60;
const TIMEZONE_MAPPINGS = {/* */};

// Functions: camelCase, descriptive verbs
const createMeetingEmbed = () => {};
const validateTimezonInput = () => {};

// Variables: camelCase, descriptive nouns
const meetingProposal = {};
const userAvailability = [];

// Classes: PascalCase
class MeetingScheduler {}
class TimezoneConverter {}

// Files: kebab-case
meeting - handler.js;
timezone - utils.js;
```

## PROJECT ARCHITECTURE

### Folder Structure

webot/

├── src/

│ ├── commands/ # Slash command implementations

│ │ ├── meeting/

│ │ │ ├── propose-meeting.js

│ │ │ ├── schedule-recurring.js

│ │ │ └── meeting-notes.js

│ │ ├── availability/

│ │ │ ├── set-busy.js

│ │ │ ├── team-availability.js

│ │ │ └── set-availability.js

│ │ └── utility/

│ │ ├── quick-poll.js

│ │ └── meeting-stats.js

│ ├── handlers/ # Event and interaction handlers

│ │ ├── command-handler.js

│ │ ├── button-handler.js

│ │ └── modal-handler.js

│ ├── services/ # Business logic services

│ │ ├── meeting-service.js

│ │ ├── timezone-service.js

│ │ ├── notification-service.js

│ │ └── analytics-service.js

│ ├── utils/ # Utility functions

│ │ ├── timezone-utils.js

│ │ ├── embed-builder.js

│ │ ├── validation.js

│ │ └── date-helpers.js

│ ├── database/ # Data access layer

│ │ ├── models/

│ │ │ ├── meeting.js

│ │ │ ├── user.js

│ │ │ └── availability.js

│ │ ├── migrations/

│ │ └── database.js

│ ├── config/ # Configuration management

│ │ ├── discord.js

│ │ ├── timezones.js

│ │ └── templates.js

│ └── middleware/ # Request processing middleware

│ ├── rate-limiting.js

│ ├── error-handling.js

│ └── logging.js

├── tests/ # Test suites

│ ├── unit/

│ ├── integration/

│ └── fixtures/

├── docs/ # Documentation

├── scripts/ # Deployment and utility scripts

├── .env.example

├── package.json

└── README.md

### Architecture Patterns

#### 1. Service Layer Pattern

```javascript
// services/meeting-service.js
class MeetingService {
    constructor(database, timezoneService, notificationService) {
        this.db = database;
        this.timezones = timezoneService;
        this.notifications = notificationService;
    }

    async proposeMeeting(proposalData) {
        // Validate input
        const validation = await this.validateProposal(proposalData);
        if (!validation.isValid) {
            throw new ValidationError(validation.errors);
        }

        // Business logic
        const meeting = await this.createMeeting(proposalData);
        await this.scheduleNotifications(meeting);

        return meeting;
    }
}
```

#### 2. Repository Pattern

```javascript
// database/models/meeting.js
class MeetingRepository {
    constructor(database) {
        this.db = database;
    }

    async create(meetingData) {
        // Database-specific implementation
    }

    async findByUser(userId) {
        // Query implementation
    }

    async findUpcoming(limit = 10) {
        // Query with pagination
    }
}
```

#### 3. Command Pattern for Discord Interactions

```javascript
// commands/base-command.js class BaseCommand { constructor() { this.data =
null; // SlashCommandBuilder this.permissions = []; }

async execute(interaction) { throw new Error('Execute method must be
implemented'); }

async validate(interaction) { // Common validation logic } }

// commands/meeting/propose-meeting.js class ProposeMeetingCommand extends
BaseCommand { constructor(meetingService) { super(); this.meetingService =
meetingService; this.data = new SlashCommandBuilder()
.setName('propose-meeting') .setDescription('Propose a meeting time'); }

async execute(interaction) { try { await this.validate(interaction); const
proposal = await this.extractProposalData(interaction); const meeting = await
this.meetingService.proposeMeeting(proposal); await
this.sendResponse(interaction, meeting); } catch (error) { await
this.handleError(interaction, error); } } }
```

### MODULARITY PRINCIPLES

#### 1. Single Responsibility

//Each module should have one clear purpose:

```javascript
// ❌ Bad - handles multiple concerns
class MeetingManager {
    createMeeting() {}
    sendNotification() {}
    validateTimezone() {}
    generateEmbed() {}
}

// ✅ Good - focused responsibilities
class MeetingService {
    createMeeting() {}
}

class NotificationService {
    sendNotification() {}
}

class TimezoneValidator {
    validateTimezone() {}
}
```

#### 2. Dependency Injection

```javascript
// ❌ Bad - tight coupling
class MeetingCommand {
    execute() {
        const service = new MeetingService(); // Hard dependency
    }
}

// ✅ Good - injected dependencies
class MeetingCommand {
    constructor(meetingService, timezoneService) {
        this.meetingService = meetingService;
        this.timezoneService = timezoneService;
    }
}
```

#### 3. Interface Segregation

```javascript
// Create specific interfaces for different use cases
class NotificationInterface {
    async sendReminder(meeting, user) {}
    async sendUpdate(meeting, participants) {}
}

class AnalyticsInterface {
    async trackMeetingCreated(meeting) {}
    async trackUserResponse(user, response) {}
}
```

### REUSABLE FUNCTIONS

#### Utility Functions Structure

    ```javascript
    // utils/timezone-utils.js
    const timezoneUtils = {
      convertToUserTimezone: (utcTime, timezone) => {
        // Implementation with error handling
      },

      formatTimeForDisplay: (time, timezone, format = 'PPP p') => {
        // Consistent formatting across app
      },

      validateTimezone: (timezone) => {
        // Validation with clear error messages
      }
    };

    module.exports = timezoneUtils;

Error Handling Utilities

    // utils/error-handling.js
    class AppError extends Error {
      constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
      }
    }

    const handleDiscordError = async (interaction, error) => {
      const errorMessage = error.isOperational 
        ? error.message 
        : 'An unexpected error occurred';

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    };

````
### TESTING STANDARDS

#### Unit Testing Structure
    ```javascript
	// tests/unit/services/meeting-service.test.js
	const { describe, test, expect, beforeEach, jest } = require('@jest/globals');
	const MeetingService = require('../../../src/services/meeting-service');
	
	describe('MeetingService', () => {
	  let meetingService;
	  let mockDatabase;
	  let mockTimezoneService;
	
	  beforeEach(() => {
	    mockDatabase = {
	      create: jest.fn(),
	      findById: jest.fn()
	    };
	    
	    mockTimezoneService = {
	      convertToUserTimezone: jest.fn()
	    };
	
	    meetingService = new MeetingService(mockDatabase, mockTimezoneService);
	  });
	
	  describe('proposeMeeting', () => {
	    test('should create meeting with valid data', async () => {
	      // Test implementation
	    });
	
	    test('should throw validation error for invalid data', async () => {
	      // Test implementation
	    });
	  });
	});
````

#### Integration Testing

```javascript
// tests/integration/discord-commands.test.js
const { testCommandExecution } = require("../helpers/discord-test-utils");

describe("Discord Commands Integration", () => {
    test("/propose-meeting creates meeting and responds correctly", async () => {
        const mockInteraction = createMockInteraction({
            commandName: "propose-meeting",
            options: {
                date: "2025-09-18",
                time: "14:00",
                timezone: "Europe/Helsinki",
            },
        });

        await testCommandExecution(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith(
            expect.objectContaining({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        title: expect.stringContaining("Meeting"),
                    }),
                ]),
            }),
        );
    });
});
```

### PERFORMANCE BEST PRACTICES

#### 1. Database Optimization

    ```javascript
    // Use indexes for frequent queries
    const createUserIndex = `
      CREATE INDEX idx_user_timezone ON users(timezone);
      CREATE INDEX idx_meeting_date ON meetings(meeting_date);
    `;

    // Batch operations where possible
    const updateMultipleUsers = async (updates) => {
      const transaction = await db.beginTransaction();
      try {
        for (const update of updates) {
          await db.users.update(update);
        }
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    };

````
#### 2. Caching Strategy
```javascript
	// utils/cache.js
	class MemoryCache {
	  constructor(ttl = 300000) { // 5 minutes default
	    this.cache = new Map();
	    this.ttl = ttl;
	  }
	
	  get(key) {
	    const item = this.cache.get(key);
	    if (!item) return null;
	    
	    if (Date.now() > item.expiry) {
	      this.cache.delete(key);
	      return null;
	    }
	    
	    return item.value;
	  }
	
	  set(key, value) {
	    this.cache.set(key, {
	      value,
	      expiry: Date.now() + this.ttl
	    });
	  }
	}
````

#### 3. Rate Limiting

```javascript
// middleware/rate-limiting.js
const rateLimiter = new Map();

const checkRateLimit = (userId, commandName, limit = 5, window = 60000) => {
    const key = `${userId}:${commandName}`;
    const now = Date.now();

    if (!rateLimiter.has(key)) {
        rateLimiter.set(key, { count: 1, resetTime: now + window });
        return true;
    }

    const userLimit = rateLimiter.get(key);

    if (now > userLimit.resetTime) {
        rateLimiter.set(key, { count: 1, resetTime: now + window });
        return true;
    }

    if (userLimit.count >= limit) {
        return false;
    }

    userLimit.count++;
    return true;
};
```

### SECURITY CONSIDERATIONS

#### Input Validation

```javascript
// utils/validation.js
const validateMeetingInput = (input) => {
    const errors = [];

    // Validate date format
    if (!moment(input.date, "YYYY-MM-DD", true).isValid()) {
        errors.push("Invalid date format. Use YYYY-MM-DD");
    }

    // Validate time format
    if (!moment(input.time, "HH:mm", true).isValid()) {
        errors.push("Invalid time format. Use HH:MM");
    }

    // Validate timezone
    if (!moment.tz.zone(input.timezone)) {
        errors.push("Invalid timezone");
    }

    // Sanitize text inputs
    input.title = sanitizeHtml(input.title);

    return {
        isValid: errors.length === 0,
        errors,
        sanitizedInput: input,
    };
};
```

#### Environment Configuration

```javascript
// config/environment.js
const requiredEnvVars = [
    "DISCORD_TOKEN",
    "DISCORD_CLIENT_ID",
    "DATABASE_URL",
];

const validateEnvironment = () => {
    const missing = requiredEnvVars.filter((varName) => !process.env[varName]);

    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(", ")}`,
        );
    }
};

module.exports = {
    discord: {
        token: process.env.DISCORD_TOKEN,
        clientId: process.env.DISCORD_CLIENT_ID,
    },
    database: {
        url: process.env.DATABASE_URL,
    },
    validateEnvironment,
};
```

### DOCUMENTATION STANDARDS

#### JSDoc Comments

    /**
     * Proposes a new meeting and sends notifications
     * @param {Object} proposalData - Meeting proposal details
     * @param {string} proposalData.title - Meeting title
     * @param {Date} proposalData.dateTime - Proposed meeting time in UTC
     * @param {number} proposalData.duration - Duration in minutes
     * @param {string[]} proposalData.participants - Array of user IDs
     * @returns {Promise<Meeting>} The created meeting object
     * @throws {ValidationError} When proposal data is invalid
     * @throws {DatabaseError} When database operation fails
     */
    async function proposeMeeting(proposalData) {
      // Implementation
    }

#### README Structure

- Project overview and features

- Installation and setup instructions

- Configuration guide

- Usage examples with screenshots

- API documentation

- Troubleshooting guide

- Contributing guidelines

Follow these standards consistently throughout the project to ensure
maintainable, scalable, and robust code that can be easily understood and
extended by other developers.
