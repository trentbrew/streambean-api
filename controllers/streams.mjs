import { BaseController } from './base.mjs'

export class StreamsController extends BaseController {
  constructor(twitchService, baseUrl, categories) {
    super(twitchService)
    this.baseUrl = baseUrl
    this.categories = categories
  }

  async getStreams(category) {
    const endpoint = 'https://api.twitch.tv/helix/streams'
    const params = category === 'top' ? { first: 100 } : { first: 100, game_id: this.categories[category].id }

    const streams = await this.twitchService.fetchFromTwitch(endpoint, params)
    return streams.map((stream) => this.enrichStream(stream))
  }

  enrichStream(stream) {
    return {
      ...stream,
      player_url: `${this.baseUrl}/player/${stream.user_login}`,
      thumbnail_url: stream.thumbnail_url?.replace('{width}', '960')?.replace('{height}', '540'),
    }
  }
}
