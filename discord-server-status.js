import tinygradient from 'tinygradient';
import { COPYRIGHT_MESSAGE } from '../utils/constants.js';
import DiscordBaseMessageUpdater from './discord-base-message-updater.js';

/**
 * SquadJS Discord Plugin - Rate-Limit Resilient
 * @author Slacker | https://github.com/mikebjoyce/squadjs-discord-plugin-rework
 */

export default class DiscordServerStatus extends DiscordBaseMessageUpdater {
  static get description() {
    return 'The <code>DiscordServerStatus</code> plugin can be used to get the server status in Discord.';
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      ...DiscordBaseMessageUpdater.optionsSpecification,
      command: {
        required: false,
        description: 'Command name to get message.',
        default: '!status'
      },
      updateInterval: {
        required: false,
        description: 'How frequently to update the time in Discord.',
        default: 2 * 60 * 1000 // 2 minutes
      },
      setBotStatus: {
        required: false,
        description: "Whether to update the bot's status with server information.",
        default: true
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.updateMessages = this.updateMessages.bind(this);
    this.updateStatus = this.updateStatus.bind(this);
    this.updateCount = 0;
  }

  async mount() {
    await super.mount();
    if (this.options.updateInterval < 2 * 60 * 1000 ) //2 minutes
      this.verbose(1, 'Update interval is less than 2 minutes. This may cause rate limits.');

    this.updateInterval = setInterval(this.updateMessages, this.options.updateInterval);
    this.updateStatusInterval = setInterval(this.updateStatus, this.options.updateInterval);

    this.rateLimitListener = (data) => {
      this.verbose(1, 'Discord API Rate Limit Hit:', data);
    };
    this.options.discordClient.on('rateLimit', this.rateLimitListener);
  }

  async unmount() {
    await super.unmount();
    clearInterval(this.updateInterval);
    clearInterval(this.updateStatusInterval);
    if (this.rateLimitListener)
      this.options.discordClient.removeListener('rateLimit', this.rateLimitListener);
  }

  async generateMessage() {
    // Set player embed field.
    let players = '';

    players += `${this.server.a2sPlayerCount}`;
    if (this.server.publicQueue + this.server.reserveQueue > 0)
      players += ` (+${this.server.publicQueue + this.server.reserveQueue})`;

    players += ` / ${this.server.publicSlots}`;
    if (this.server.reserveSlots > 0) players += ` (+${this.server.reserveSlots})`;

    const layerName = this.server.currentLayer
      ? this.server.currentLayer.name
      : (await this.server.rcon.getCurrentMap()).layer;

    // Clamp the ratio between 0 and 1 to avoid tinygradient errors.
    const ratio = this.server.a2sPlayerCount / (this.server.publicSlots + this.server.reserveSlots);
    const clampedRatio = Math.min(1, Math.max(0, ratio));

    // Set gradient embed color.
    const color = parseInt(
      tinygradient([
        { color: '#ff0000', pos: 0 },
        { color: '#ffff00', pos: 0.5 },
        { color: '#00ff00', pos: 1 }
      ])
        .rgbAt(clampedRatio)
        .toHex(),
      16
    );

    const embedobj = {
      title: this.server.serverName,
      fields: [
        {
          name: 'Players',
          value: players
        },
        {
          name: 'Current Layer',
          value: `\`\`\`${layerName || 'Unknown'}\`\`\``,
          inline: true
        },
        {
          name: 'Next Layer',
          value: `\`\`\`${
            this.server.nextLayer?.name ||
            (this.server.nextLayerToBeVoted ? 'To be voted' : 'Unknown')
          }\`\`\``,
          inline: true
        }
      ],
      color: color,
      footer: { text: COPYRIGHT_MESSAGE },
      timestamp: new Date(),
      // Dont use CDN for images, use raw.githubusercontent.com.
      // Also not updated for 8.x properly.
      image: {
        url: this.server.currentLayer
          ? `https://raw.githubusercontent.com/Squad-Wiki/squad-wiki-pipeline-map-data/master/completed_output/_Current%20Version/images/${this.server.currentLayer.layerid}.jpg`
          : undefined
      }
    };

    return { embeds: [embedobj] };
  }

  async updateMessages() {
    const generatedMessage = await this.generateMessage();

    const comparisonObject = { ...generatedMessage };
    if (comparisonObject.embeds) {
      comparisonObject.embeds = comparisonObject.embeds.map((embed) => {
        const { timestamp, ...rest } = embed;
        return rest;
      });
    }
    const cacheString = JSON.stringify(comparisonObject);

    if (this.lastCacheString === cacheString) {
      this.stats.updatesSkipped++;
      return;
    }

    this.lastCacheString = cacheString;
    await super.updateMessages();
  }

  async updateStatus() {
    this.updateCount++;
    if (this.updateCount % 10 === 0) {
      this.verbose(
        1,
        `Telemetry Summary: ${this.stats.updatesSent} edits sent, ${this.stats.updatesSkipped} edits skipped due to no change.`
      );
    }
    if (!this.options.setBotStatus) return;

    await this.options.discordClient.user.setActivity(
      `(${this.server.a2sPlayerCount}/${this.server.publicSlots}) ${
        this.server.currentLayer?.name || 'Unknown'
      }`,
      { type: 4 }
    );
  }
}
