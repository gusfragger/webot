const { Client, GatewayIntentBits } = require('discord.js');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const config = require('./src/config/discord');
const { validateEnvironment } = require('./src/config/environment');
const commandHandler = require('./src/handlers/command-handler');
const buttonHandler = require('./src/handlers/button-handler');
const { initializeDatabase } = require('./src/database/database');

class WebotClient {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.client.once('ready', async () => {
      console.log(`✅ ${this.client.user.tag} is online and ready!`);
      console.log(`📊 Serving ${this.client.guilds.cache.size} servers`);

      await this.registerCommands();
    });

    this.client.on('interactionCreate', async (interaction) => {
      try {
        if (interaction.isChatInputCommand()) {
          await commandHandler.handleCommand(interaction);
        } else if (interaction.isButton()) {
          await buttonHandler.handleButton(interaction);
        } else if (interaction.isModalSubmit()) {
          await buttonHandler.handleModal(interaction);
        }
      } catch (error) {
        console.error('Error handling interaction:', error);

        const errorMessage = 'Sorry, something went wrong while processing your request.';

        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      }
    });

    this.client.on('error', (error) => {
      console.error('Discord client error:', error);
    });

    process.on('unhandledRejection', (error) => {
      console.error('Unhandled promise rejection:', error);
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      process.exit(1);
    });
  }

  async registerCommands() {
    const commands = [];
    const commandsPath = path.join(__dirname, 'src/commands');

    const loadCommands = (dir) => {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          loadCommands(filePath);
        } else if (file.endsWith('.js')) {
          const command = require(filePath);
          if (command.data && command.execute) {
            commands.push(command.data.toJSON());
            console.log(`📝 Loaded command: ${command.data.name}`);
          }
        }
      }
    };

    loadCommands(commandsPath);

    try {
      await this.client.application.commands.set(commands);
      console.log(`🔄 Successfully registered ${commands.length} application commands`);
    } catch (error) {
      console.error('Failed to register commands:', error);
    }
  }

  async start() {
    try {
      validateEnvironment();
      await initializeDatabase();
      await this.client.login(config.token);
    } catch (error) {
      console.error('Failed to start bot:', error);
      process.exit(1);
    }
  }
}

const bot = new WebotClient();
bot.start();