import { BaseController } from './base.mjs'

export class BroadcastersController extends BaseController {
  async getBroadcaster(broadcasterId) {
    const [channelData, scheduleData] = await Promise.all([
      this.twitchService.fetchFromTwitch('https://api.twitch.tv/helix/channels', {
        broadcaster_id: broadcasterId,
      }),
      this.twitchService.getSchedule(broadcasterId),
    ])

    const channel = channelData[0]
    if (!channel) {
      return null
    }

    return {
      id: channel.broadcaster_id,
      name: channel.broadcaster_name,
      category_name: channel.game_name,
      category_id: channel.game_id,
      tags: channel.tags || [],
      schedule: scheduleData,
    }
  }
}
