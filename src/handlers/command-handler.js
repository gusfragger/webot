const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');

class CommandHandler {
  constructor() {
    this.commands = new Collection();
    this.loadCommands();
  }

  loadCommands() {
    const commandsPath = path.join(__dirname, '../commands');
    this.loadCommandsFromDirectory(commandsPath);
  }

  loadCommandsFromDirectory(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        this.loadCommandsFromDirectory(filePath);
      } else if (file.endsWith('.js')) {
        try {
          const command = require(filePath);

          if (command.data && command.execute) {
            this.commands.set(command.data.name, command);
            console.log(`📝 Loaded command: ${command.data.name}`);
          } else {
            console.warn(`⚠️  Command at ${filePath} is missing required properties`);
          }
        } catch (error) {
          console.error(`❌ Failed to load command at ${filePath}:`, error);
        }
      }
    }
  }

  async handleCommand(interaction) {
    const command = this.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing command ${interaction.commandName}:`, error);

      const errorMessage = 'There was an error while executing this command!';

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }

  getCommand(name) {
    return this.commands.get(name);
  }

  getAllCommands() {
    return Array.from(this.commands.values());
  }

  reloadCommand(commandName) {
    const command = this.commands.get(commandName);
    if (!command) {
      throw new Error(`Command ${commandName} not found`);
    }

    delete require.cache[require.resolve(command.filePath)];

    try {
      const newCommand = require(command.filePath);
      this.commands.set(commandName, newCommand);
      console.log(`🔄 Reloaded command: ${commandName}`);
      return true;
    } catch (error) {
      console.error(`Failed to reload command ${commandName}:`, error);
      return false;
    }
  }
}

module.exports = new CommandHandler();