import { BaseController } from './base.mjs'

export class ChannelsController extends BaseController {
  constructor(twitchService, channels) {
    super(twitchService)
    this.channels = channels
  }

  getDefaultChannels() {
    return this.channels
  }

  async searchChannels(query) {
    const channels = await this.twitchService.fetchFromTwitch('https://api.twitch.tv/helix/search/channels', { query, first: 20, live_only: false })
    return channels.map(this.formatChannel)
  }

  formatChannel(channel) {
    return {
      id: channel.id,
      displayName: channel.display_name,
      name: channel.broadcaster_login,
      thumbnailUrl: channel.thumbnail_url,
      isLive: channel.is_live,
      gameId: channel.game_id,
      gameName: channel.game_name,
    }
  }
}
