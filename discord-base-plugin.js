import BasePlugin from './base-plugin.js';

import { COPYRIGHT_MESSAGE } from '../utils/constants.js';

export default class DiscordBasePlugin extends BasePlugin {
  static get optionsSpecification() {
    return {
      discordClient: {
        required: true,
        description: 'Discord connector name.',
        connector: 'discord',
        default: 'discord'
      }
    };
  }

  async prepareToMount() {
    if (!this.options.channelID) {
      this.verbose(1, 'Channel ID not provided. Skipping channel fetch.');
      return;
    }

    try {
      this.channel = await this.options.discordClient.channels.fetch(this.options.channelID);
    } catch (error) {
      this.channel = null;
      this.verbose(
        1,
        `Could not fetch Discord channel with channelID "${this.options.channelID}". Error: ${error.message}`
      );
      this.verbose(2, `${error.stack}`);
    }
  }

  async sendDiscordMessage(message) {
    if (!this.channel) {
      this.verbose(1, `Could not send Discord Message. Channel not initialized.`);
      return;
    }

    if (typeof message === 'object' && 'embed' in message) {
      message.embed.footer = message.embed.footer || { text: COPYRIGHT_MESSAGE };
      if (typeof message.embed.color === 'string')
        message.embed.color = parseInt(message.embed.color, 16);
      message = { ...message, embeds: [message.embed] };
    }

    try {
      await this.channel.send(message);
    } catch (error) {
      if (error.status === 429) {
        let waitTime = 2000;
        if (error.retryAfter) {
          waitTime = error.retryAfter;
        } else if (error.headers && error.headers['retry-after']) {
          waitTime = parseFloat(error.headers['retry-after']) * 1000;
        }
        this.verbose(1, `Rate limit hit, attempting retry in ${waitTime}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        try {
          await this.channel.send(message);
        } catch (retryError) {
          this.verbose(1, `Failed to send Discord message after retry: ${retryError.message}`, retryError);
        }
      } else {
        this.verbose(1, `Failed to send Discord message: ${error.message}`, error);
      }
    }
  }
}
