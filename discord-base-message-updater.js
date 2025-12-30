import Sequelize from 'sequelize';

import BasePlugin from './base-plugin.js';

const { DataTypes } = Sequelize;

export default class DiscordBaseMessageUpdater extends BasePlugin {
  static get optionsSpecification() {
    return {
      discordClient: {
        required: true,
        description: 'Discord connector name.',
        connector: 'discord',
        default: 'discord'
      },
      messageStore: {
        required: true,
        description: 'Sequelize connector name.',
        connector: 'sequelize',
        default: 'sqlite'
      },
      command: {
        required: true,
        description: 'Command name to get message.',
        default: '',
        example: '!command'
      },
      disableSubscriptions: {
        required: false,
        description: 'Whether to allow messages to be subscribed to automatic updates.',
        default: false
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.messageCache = new Map();

    // Setup model to store subscribed messages.
    this.SubscribedMessage = this.options.messageStore.define(
      `${this.constructor.name}_SubscribedMessage`,
      { channelID: DataTypes.STRING, messageID: DataTypes.STRING, server: DataTypes.INTEGER },
      { timestamps: false }
    );

    this.onDiscordMessage = this.onDiscordMessage.bind(this);
  }

  async prepareToMount() {
    await this.SubscribedMessage.sync();
  }

  async mount() {
    const subscribedMessages = await this.SubscribedMessage.findAll({
      where: { server: this.server.id }
    });

    for (const subscribedMessage of subscribedMessages) {
      const { channelID, messageID } = subscribedMessage;
      try {
        const channel = await this.options.discordClient.channels.fetch(channelID);
        const message = await channel.messages.fetch(messageID);
        this.messageCache.set(`${channelID}:${messageID}`, message);
      } catch (err) {
        this.verbose(
          1,
          `Could not fetch message (Channel ID: ${channelID}, Message ID: ${messageID}) for cache: `,
          err
        );
      }
    }

    this.options.discordClient.on('messageCreate', this.onDiscordMessage);
  }

  async unmount() {
    this.options.discordClient.removeEventListener('messageCreate', this.onDiscordMessage);
  }

  async generateMessage() {
    throw new Error('generateMessage method must be defined.');
  }

  async onDiscordMessage(message) {
    // Parse the incoming message.
    const commandMatch = message.content.match(
      new RegExp(`^${this.options.command}(?: (subscribe)| (unsubscribe) ([0-9]+) ([0-9]+))?$`, 'i')
    );

    // Stop processing the message if it does not match the command.
    if (!commandMatch) return;

    // Split message parts.
    const [subscribe, unsubscribe, channelID, messageID] = commandMatch.slice(1);

    // Handle non subscription messages.
    if (subscribe === undefined && unsubscribe === undefined) {
      this.verbose(1, 'Generating message content...');
      const generatedMessage = await this.generateMessage();

      this.verbose(1, 'Sending non-subscription message...');
      await message.channel.send(generatedMessage);
      this.verbose(1, 'Sent non-subscription message.');

      return;
    }

    // Handle subscription message.
    if (subscribe !== undefined) {
      if (this.options.disableSubscriptions) {
        await message.reply('automated updates is disabled.');
        return;
      }

      this.verbose(1, 'Generating message content...');
      const generatedMessage = await this.generateMessage();

      this.verbose(1, 'Sending subscription message...');
      const newMessage = await message.channel.send(generatedMessage);
      this.verbose(1, 'Sent subscription message.');

      // Subscribe the message for automated updates.
      const newChannelID = newMessage.channel.id;
      const newMessageID = newMessage.id;

      this.messageCache.set(`${newChannelID}:${newMessageID}`, newMessage);

      this.verbose(
        1,
        `Subscribing message (Channel ID: ${newChannelID}, Message ID: ${newMessageID}) to automated updates...`
      );
      await this.SubscribedMessage.create({
        channelID: newChannelID,
        messageID: newMessageID,
        server: this.server.id
      });
      this.verbose(
        1,
        `Subscribed message (Channel ID: ${newChannelID}, Message ID: ${newMessageID}) to automated updates.`
      );

      return;
    }

    // Handle unsubscription messages.
    if (unsubscribe !== undefined) {
      this.verbose(
        1,
        `Unsubscribing message (Channel ID: ${channelID}, Message ID: ${messageID}) from automated updates...`
      );
      this.messageCache.delete(`${channelID}:${messageID}`);
      await this.SubscribedMessage.destroy({
        where: {
          channelID: channelID,
          messageID: messageID,
          server: this.server.id
        }
      });
      this.verbose(
        1,
        `Unsubscribed message (Channel ID: ${channelID}, Message ID: ${messageID}) from automated updates.`
      );

      this.verbose(1, 'Sending acknowledgement message...');
      await message.reply('unsubscribed message from automated updates.');
      this.verbose(1, 'Sent acknowledgement message.');
    }
  }

  async updateMessages() {
    this.verbose(1, 'Generating message content for update...');
    // Generate the new message.
    const generatedMessage = await this.generateMessage();

    // Update each message.
    this.verbose(1, `Updating ${this.messageCache.size} messages...`);
    for (const [key, message] of this.messageCache) {
      const { channel, id: messageID } = message;
      const channelID = channel.id;

      try {
        this.verbose(1, `Updating message (Channel ID: ${channelID}, Message ID: ${messageID})...`);
        await message.edit(generatedMessage);
        this.verbose(1, `Updated message (Channel ID: ${channelID}, Message ID: ${messageID}).`);
      } catch (err) {
        if (err.code === 10008) {
          this.verbose(
            1,
            `Message (Channel ID: ${channelID}, Message ID: ${messageID}) was deleted. Removing from automated updates...`
          );
          this.messageCache.delete(key);
          await this.SubscribedMessage.destroy({
            where: {
              channelID: channelID,
              messageID: messageID,
              server: this.server.id
            }
          });
        } else {
          this.verbose(
            1,
            `Message (Channel ID: ${channelID}, Message ID: ${messageID}) could not be updated: ${err.message}`,
            err
          );
        }
      }
    }
  }
}
