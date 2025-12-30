import DiscordBasePlugin from './discord-base-plugin.js';

/* Example config:
    {
      "plugin": "DiscordChaosTest",
      "enabled": true,
      "discordClient": "discord",
      "discordChannelID": "YOUR_CHANNEL_ID_HERE"
    },
*/

export default class DiscordChaosTest extends DiscordBasePlugin {
  static get optionsSpecification() {
    return {
      ...DiscordBasePlugin.optionsSpecification,
      discordChannelID: {
        required: true,
        description: 'The ID of the channel to send messages to.',
        default: '',
        example: '667741905228136459'
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);
    this.onDiscordMessage = this.onDiscordMessage.bind(this);
    this.verbose(1, 'DiscordChaosTest initialized.');
  }

  async prepareToMount() {
    this.verbose(1, 'DiscordChaosTest preparing to mount...');
    this.options.channelID = this.options.discordChannelID;
    await super.prepareToMount();
    this.verbose(1, `DiscordChaosTest prepared. Channel found: ${!!this.channel}`);
  }

  async mount() {
    this.verbose(1, 'DiscordChaosTest mounting...');
    
    if (this.options.discordClient) {
      this.options.discordClient.on('message', this.onDiscordMessage);
      
      this.options.discordClient.on('rateLimit', (rateLimitInfo) => {
        this.verbose(1, `[ChaosTest] Rate Limit Hit: ${JSON.stringify(rateLimitInfo)}`);
      });
    }
  }

  async unmount() {
    this.verbose(1, 'DiscordChaosTest unmounting...');
    this.options.discordClient.removeAllListeners('message');
    await super.unmount();
  }

  onDiscordMessage = async (message) => {
    if (message.author.bot) return;

    this.verbose(1, `[ChaosTest] Discord message detected: "${message.content}" from ${message.author.tag}`);
    const content = message.content.toLowerCase().trim();
    if (content === '!startstress') {
      this.verbose(1, '[ChaosTest] Command !startstress detected. Starting full chaos suite...');
      await message.reply('Full Chaos Suite initiated! Running Polite Mode then Gateway Slam.');
      await this.runChaosLoop();
      await this.runGatewaySlam();
    }
  };

  async runChaosLoop() {
    this.verbose(1, '[ChaosTest] Starting Rapid-Fire Phase...');
    this.verbose(1, '[ChaosTest] Starting Polite Mode (25 sequential messages)...');

    if (!this.channel) {
      this.verbose(1, '[ChaosTest] ERROR: Channel is not initialized. Aborting loop.');
      return;
    }

    // The Chaos Loop: 25 iterations
    for (let i = 0; i < 25; i++) {
      this.verbose(1, `[ChaosTest] Loop iteration ${i + 1} starting...`);
      await this.sendDiscordMessage({ content: `Stress Test Iteration ${i + 1}` });
    }

    // Real-Time Reporting
    const reportMsg = `Stress Test Complete. 25 Iterations triggered.`;

    this.verbose(1, `[ChaosTest] ${reportMsg}`);
    await this.sendDiscordMessage({ content: reportMsg });
  }

  async runGatewaySlam() {
    this.verbose(1, '[ChaosTest] Starting Gateway Slam (50 concurrent messages)...');

    if (!this.channel) {
      this.verbose(1, '[ChaosTest] ERROR: Channel is not initialized. Aborting slam.');
      return;
    }

    const promises = [];
    // The Slam Loop: 50 iterations
    for (let i = 0; i < 50; i++) {
      const randomStr = Math.random().toString(36).substring(7);
      const content = `[SLAM] Message ${i + 1} - [${randomStr}]`;
      this.verbose(1, `[ChaosTest] Slam iteration ${i + 1} queued...`);
      promises.push(this.sendDiscordMessage({ content }));
    }

    await Promise.all(promises);

    const reportMsg = 'Gateway Slam Complete. 50 concurrent requests fired.';
    this.verbose(1, `[ChaosTest] ${reportMsg}`);
    await this.sendDiscordMessage({ content: reportMsg });
  }
}
