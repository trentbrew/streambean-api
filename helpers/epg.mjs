import { v4 as uuidv4 } from 'uuid'
import { channels } from './channels.mjs'

/**
 * Parses a duration string (e.g., "1h2m3s") into seconds.
 * @param {string} durationStr - The duration string to parse.
 * @returns {number} The duration in seconds.
 * @throws {Error} If the duration string is invalid.
 */
function parseDuration(durationStr) {
  if (typeof durationStr !== 'string') {
    throw new Error('Invalid duration string')
  }

  const regex = /(\d+h)?(\d+m)?(\d+s)?/
  const matches = durationStr.match(regex)

  if (!matches) {
    throw new Error('Invalid duration string format')
  }

  let seconds = 0

  matches.forEach((match) => {
    if (match) {
      const value = parseInt(match.slice(0, -1), 10)
      const unit = match.slice(-1)

      switch (unit) {
        case 'h':
          seconds += value * 3600
          break
        case 'm':
          seconds += value * 60
          break
        case 's':
          seconds += value
          break
      }
    }
  })

  return seconds
}

/**
 * Creates a schedule for a 24-hour period from an array of VODs.
 * @param {Array} vods - The array of VOD objects.
 * @param {string} vods[].duration - The duration of the VOD (e.g., "1h2m3s").
 * @param {string} vods[].title - The title of the VOD.
 * @param {string} vods[].url - The URL of the VOD.
 * @param {string} vods[].id - The ID of the VOD.
 * @param {string} vods[].thumbnailUrl - The thumbnail URL of the VOD.
 * @returns {Array} The schedule array.
 * @throws {Error} If the VODs array is invalid or a VOD object is missing required properties.
 */
function createSchedule(vods, category) {
  if (!Array.isArray(vods)) {
    throw new Error('Invalid VODs array')
  }

  const totalDuration = 86400 // 24 hours in seconds
  let currentTime = 0
  const schedule = []

  const currentDate = new Date()
  currentDate.setHours(0, 0, 0, 0) // Set current date to midnight

  for (let i = 0; currentTime < totalDuration; i++) {
    const vod = vods[i % vods.length]

    if (!vod || !vod.duration) {
      throw new Error('Invalid VOD object or missing duration')
    }

    // Parse duration
    const duration = parseDuration(vod.duration)
    const endTime = Math.min(currentTime + duration, totalDuration)

    // Create start and end dates
    const startDateTime = new Date(currentDate.getTime() + currentTime * 1000)
    const endDateTime = new Date(currentDate.getTime() + endTime * 1000)

    schedule.push({
      id: uuidv4(),
      description: vod.title || 'No description available',
      title: vod.title,
      since: startDateTime.toISOString(),
      till: endDateTime.toISOString(),
      channelUuid: category,
      image: vod.thumbnailUrl?.replace('%{width}', '1066')?.replace('%{height}', '600'),
      country: 'United States',
      Year: new Date().getFullYear().toString(),
      Rated: 0,
      Released: vod.created_at || vod.published_at,
      Runtime: vod.duration,
      Genre: channels.find((channel) => channel.uuid === category).title,
      Director: vod.user_login,
      Writer: 'N/A',
      Actors: 'N/A',
      Language: vod.language,
      Awards: 'N/A',
      Metascore: 'N/A',
      imdbRating: 'N/A',
      imdbVotes: 'N/A',
      imdbID: vod.id,
      Type: 'movie',
      totalSeasons: 'N/A',
      Response: 'True',
      Ratings: [
        {
          Source: 'N/A',
          Value: 'N/A',
        },
      ],
      rating: 3,
    })

    currentTime = endTime
  }
  return schedule
}

export default createSchedule
