// services/twitch.mjs
import axios from 'axios'

export class TwitchService {
  constructor(clientId, clientSecret) {
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.accessToken = null
  }

  async getAccessToken() {
    try {
      const response = await axios.post(`https://id.twitch.tv/oauth2/token?client_id=${this.clientId}&client_secret=${this.clientSecret}&grant_type=client_credentials`)
      this.accessToken = response.data.access_token
      return this.accessToken
    } catch (error) {
      console.error('Error getting Twitch access token:', error)
      return null
    }
  }

  async fetchFromTwitch(url, params = {}) {
    if (!this.accessToken) {
      this.accessToken = await this.getAccessToken()
    }
    if (!this.accessToken) {
      throw new Error('Failed to get access token')
    }

    const response = await axios.get(url, {
      headers: {
        'Client-ID': this.clientId,
        Authorization: `Bearer ${this.accessToken}`,
      },
      params,
    })
    return response.data.data
  }

  async getBroadcasterSchedules(ids) {
    const schedulePromises = ids.map((id) => this.getSchedule(id))
    const schedulesArray = await Promise.all(schedulePromises)
    return schedulesArray.flat()
  }

  async getSchedule(broadcasterId) {
    try {
      const scheduleData = await this.fetchFromTwitch('https://api.twitch.tv/helix/schedule', { broadcaster_id: broadcasterId })
      return scheduleData?.segments?.map((segment) => this.formatScheduleSegment(broadcasterId, segment)) || []
    } catch (error) {
      console.error(`Error fetching schedule for broadcaster ${broadcasterId}:`, error.message)
      return []
    }
  }

  formatScheduleSegment(broadcasterId, segment) {
    const { start_time, end_time, ...rest } = segment
    return {
      broadcaster_id: broadcasterId,
      since: start_time,
      till: end_time,
      channelUuid: rest.category?.id,
      ...rest,
    }
  }
}
