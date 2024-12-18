import express from 'express'
import bodyParser from 'body-parser'
import path from 'path'
import cors from 'cors'
import axios from 'axios'
import timeout from 'connect-timeout'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { inject } from '@vercel/analytics'

import { channels } from './helpers/channels.mjs'
import categories from './helpers/defaults.mjs'
import createSchedule from './helpers/scheduler.mjs'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

app.use(cors())
app.use(timeout('90s'))
app.use(bodyParser.json())
app.use(express.static('public'))
app.use(express.static(path.join(__dirname, 'public')))
app.use(express.urlencoded({ extended: true }))

inject()

const PORT = process.env.PORT || 8018
const BASE_URL = process.env.NODE_ENV === 'production' ? 'https://api.streambean.tv' : `http://localhost:${PORT}`
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET

let twitchAccessToken = null

// ------------ HELPERS ------------

async function getTwitchAccessToken() {
  console.log('Getting Twitch access token...')
  try {
    const response = await axios.post(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`)
    twitchAccessToken = response.data.access_token
    return twitchAccessToken
  } catch (error) {
    console.error('Error getting Twitch access token:', error)
    return null
  }
}

async function fetchFromTwitch(url, params = {}) {
  if (!twitchAccessToken) {
    twitchAccessToken = await getTwitchAccessToken()
  }
  if (!twitchAccessToken) {
    throw new Error('Failed to get access token')
  }
  const response = await axios.get(url, {
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      Authorization: `Bearer ${twitchAccessToken}`,
    },
    params,
  })
  return response.data.data
}

function getBroadcasterIds(responseArray) {
  return responseArray.map((item) => item.user_id)
}

async function getBroadcasterSchedules(ids) {
  const schedulePromises = ids.map(async (id) => {
    try {
      const scheduleData = await fetchFromTwitch('https://api.twitch.tv/helix/schedule', { broadcaster_id: id })
      const segments =
        scheduleData?.segments?.map((segment) => {
          const { start_time, end_time, ...rest } = segment
          return {
            broadcaster_id: id,
            since: start_time,
            till: end_time,
            channelUuid: rest.category.id,
            ...rest,
          }
        }) || []
      return segments
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.error(`Schedule not found for broadcaster ${id}:`, error.response.data.message)
      } else {
        console.error(`Error fetching schedule for broadcaster ${id}:`, error.message)
      }
      return []
    }
  })
  const schedulesArray = await Promise.all(schedulePromises)
  return schedulesArray.flat()
}

// TODO: maybe get rid of this

async function adjustScheduleItems(scheduleItems, since, till) {
  const sortedItems = scheduleItems
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .filter((item) => new Date(item.start_time) >= new Date(since) && new Date(item.end_time) <= new Date(till))
  const adjustedSchedule = []
  for (const item of sortedItems) {
    if (adjustedSchedule.length === 0) {
      adjustedSchedule.push(item)
      continue
    }
    const lastItem = adjustedSchedule[adjustedSchedule.length - 1]
    const lastEnd = new Date(lastItem.end_time).getTime()
    const currentStart = new Date(item.start_time).getTime()
    if (currentStart < lastEnd) {
      item.start_time = new Date(lastEnd).toISOString()
    }
    if (!(item.start_time === lastItem.start_time && item.end_time === lastItem.end_time)) {
      adjustedSchedule.push(item)
    }
  }
  return adjustedSchedule
}

// ------------ ROUTES ------------

app.get('/', (req, res) => {
  const iframeContent = `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Streambean API</title>
            <style>
              body,
              html {
                margin: 0;
                padding: 0;
                height: 100%;
                overflow: hidden;
              }
              iframe {
                width: 100%;
                height: 100%;
                border: none;
              }
            </style>
          </head>
          <body>
            <iframe src="https://trentbrew.com/tv" frameborder="0" allowfullscreen></iframe>
          </body>
        </html>
      `
  res.send(iframeContent)
})

app.get('/player', (req, res) => {
  const channel = req.params.channel
  const video = req.query.video
  if (channel && video) {
    return res.status(400).json({ error: 'Channel and video cannot be provided at the same time' })
  }
  const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Streambean Player | ${channel || video}</title>
            <style>
              body,
              html {
                overflow: hidden;
                background: black;
                height: 100vh;
                margin: 0;
                padding: 0;
              }
              #twitch-embed {
                width: 100%;
                height: 100vh;
              }
            </style>
          </head>
          <body>
            <div id="twitch-embed"></div>
            <script src="https://player.twitch.tv/js/embed/v1.js"></script>
            <script>
              window.addEventListener(
                'error',
                function (event) {
                  if (event.message.includes('aria-hidden')) {
                    event.preventDefault();
                  }
                },
                true,
              );
            </script>
            <script type="text/javascript">
              new Twitch.Player('twitch-embed', {
                ${channel ? `channel: '${channel}'` : ''}
                ${video ? `video: '${video}'` : ''}
                width: '100%',
                height: '100%',
                allowfullscreen: true,
              });
            </script>
          </body>
        </html>
      `
  res.send(htmlContent)
})

app.get('/v1/streams/:category', async (req, res) => {
  console.log('Fetching streams...')
  try {
    const category = req.params.category
    if (!category) {
      return res.status(400).json({ error: 'Category is required' })
    }
    const streams =
      category === 'top'
        ? await fetchFromTwitch('https://api.twitch.tv/helix/streams', {
            first: 100,
          })
        : await fetchFromTwitch(`https://api.twitch.tv/helix/streams?game_id=${categories[category].id}`, {
            first: 100,
          })
    const enrichedStreams = streams.map((stream) => ({
      ...stream,
      player_url: `${BASE_URL}/player/${stream.user_login}`,
      thumbnail_url: stream.thumbnail_url?.replace('{width}', '960')?.replace('{height}', '540'),
    }))
    return res.json(enrichedStreams)
  } catch (error) {
    console.error('Error fetching Twitch streams:', error)
    return res.status(500).json({ error: 'Failed to fetch streams' })
  }
})

app.get('/v1/defaults/categories', (req, res) => {
  return res.json(categories)
})

// ------------ CATEGORIES ------------

// Search categories

app.get('/v1/search/categories', async (req, res) => {
  console.log('Searching categories...')
  try {
    const query = req.query.query
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' })
    }
    const categoriesResult = await fetchFromTwitch('https://api.twitch.tv/helix/search/categories', {
      query: query,
      first: 20,
    })
    const formattedCategories = categoriesResult.map((category) => ({
      id: category.id,
      name: category.name,
      boxArtUrl: category.box_art_url,
    }))
    return res.json(formattedCategories)
  } catch (error) {
    console.error('Error searching categories:', error)
    return res.status(500).json({ error: 'Failed to search categories' })
  }
})

// Get category by ID

app.get('/v1/categories/:category_id', async (req, res) => {
  console.log('Fetching category by ID...')
  try {
    const categoryId = req.params.category_id
    if (!categoryId) {
      return res.status(400).json({ error: 'Category ID is required' })
    }
    const category = Object.values(categories).find((cat) => cat.id === categoryId)
    if (!category) {
      return res.status(404).json({ error: 'Category not found' })
    }
    return res.json(category)
  } catch (error) {
    console.error('Error fetching category by ID:', error)
    return res.status(500).json({ error: 'Failed to fetch category' })
  }
})

// ------------ SCHEDULE ------------

// Get schedule by broadcaster ID

app.get('/v1/schedule/:broadcaster_id', async (req, res) => {
  console.log('Fetching scheduled streams...')
  try {
    const broadcasterId = req.params.broadcaster_id
    if (!broadcasterId) {
      return res.status(400).json({ error: 'Broadcaster ID is required' })
    }
    const schedule = await fetchFromTwitch(`https://api.twitch.tv/helix/schedule?broadcaster_id=${broadcasterId}`).catch((error) => {
      console.error('Error fetching scheduled streams:', error)
      return []
    })
    const formattedSchedule = schedule?.segments?.map((segment) => ({
      id: segment.id,
      startTime: segment.start_time,
      endTime: segment.end_time,
      title: segment.title,
      isRecurring: segment.is_recurring,
    }))
    console.log(`Fetched ${formattedSchedule.length} schedule items`)
    return res.json(formattedSchedule)
  } catch (error) {
    console.error('Error fetching scheduled streams:', error)
    return res.status(500).json({ error: 'Failed to fetch scheduled streams' })
  }
})

// Get schedule items

app.get('/v1/scheduleitems', async (req, res) => {
  console.log('Fetching schedule items...')
  try {
    const category = req.query.category
    const since = req.query.since || new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
    const till = req.query.till || new Date(new Date().setHours(23, 59, 59, 999)).toISOString()
    if (!category) {
      return res.status(400).json({ error: 'Category query parameter is required' })
    }
    const categoryData = categories[category]
    if (!categoryData) {
      return res.status(400).json({ error: 'Invalid category' })
    }
    const streams = await fetchFromTwitch(`https://api.twitch.tv/helix/streams?game_id=${categoryData.id}`, {
      first: 100,
    })
    const broadcasterIds = getBroadcasterIds(streams)
    if (broadcasterIds.length === 0) {
      return res.json({ timeslots: [] })
    }
    const scheduleItems = await getBroadcasterSchedules(broadcasterIds)
    console.log(`Fetched ${scheduleItems.length} schedule items`)
    return res.json(scheduleItems)
  } catch (error) {
    console.error('Error fetching timeslots:', error)
    return res.status(500).json({ error: 'Failed to fetch timeslots' })
  }
})

// ------------ VIDEOS ------------

// Get videos by game ID

app.get('/v1/videos/:game_id', async (req, res) => {
  console.log('Fetching videos...')
  try {
    const game_id = req.params.game_id
    if (!game_id) {
      return res.status(400).json({ error: 'Game ID is required' })
    }
    const videos = await fetchFromTwitch(`https://api.twitch.tv/helix/videos?game_id=${game_id}`, {
      first: 100,
    })
    const adjustedVideos = videos.map((video) => ({
      ...video,
      thumbnail_url: video.thumbnail_url?.replace('{width}', '960')?.replace('{height}', '540'),
    }))
    console.log(`Fetched ${videos.length} videos for game ID ${game_id}`)
    return res.json(adjustedVideos)
  } catch (error) {
    console.error('Error fetching videos:', error)
    return res.status(500).json({ error: 'Failed to fetch videos' })
  }
})

// ------------ CHANNELS ------------

// List default channels

app.get('/v1/channels', (req, res) => {
  return res.json(channels)
})

// Search channels

app.get('/v1/search/channels', async (req, res) => {
  console.log('Searching channels...')
  try {
    const query = req.query.query
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' })
    }
    const channels = await fetchFromTwitch('https://api.twitch.tv/helix/search/channels', {
      query: query,
      first: 20,
      live_only: false,
    })
    const formattedChannels = channels.map((channel) => ({
      id: channel.id,
      displayName: channel.display_name,
      name: channel.broadcaster_login,
      thumbnailUrl: channel.thumbnail_url,
      isLive: channel.is_live,
      gameId: channel.game_id,
      gameName: channel.game_name,
    }))
    console.log(`Fetched ${formattedChannels.length} channels`)
    return res.json(formattedChannels)
  } catch (error) {
    console.error('Error searching channels:', error)
    return res.status(500).json({ error: 'Failed to search channels' })
  }
})

// ------------ BROADCASTER ------------

// Get broadcaster by ID

app.get('/v1/broadcasters/:broadcaster_id', async (req, res) => {
  console.log('Fetching channel information...')
  try {
    const broadcasterId = req.params.broadcaster_id
    if (!broadcasterId) {
      return res.status(400).json({ error: 'Broadcaster ID is required' })
    }
    const [channelData, scheduleData] = await Promise.all([
      fetchFromTwitch(`https://api.twitch.tv/helix/channels`, {
        broadcaster_id: broadcasterId,
      }),
      fetchFromTwitch(`https://api.twitch.tv/helix/schedule?broadcaster_id=${broadcasterId}`).catch((error) => {
        console.error('Error fetching scheduled streams:', error)
        return []
      }),
    ])
    const channel = channelData[0]
    if (!channel) {
      return res.status(404).json({ error: 'Broadcaster not found' })
    }
    const formattedSchedule = scheduleData?.segments?.map((segment) => ({
      id: segment.id,
      startTime: segment.start_time,
      endTime: segment.end_time,
      title: segment.title,
      isRecurring: segment.is_recurring,
    }))
    return res.json({
      id: channel.broadcaster_id,
      name: channel.broadcaster_name,
      category_name: channel.game_name,
      category_id: channel.game_id,
      tags: channel.tags || [],
      schedule: formattedSchedule || [],
    })
  } catch (error) {
    console.error('Error fetching channel information:', error)
    return res.status(500).json({ error: 'Failed to fetch channel information' })
  }
})

// ------------ TIMESLOTS ------------

// Get timeslots by category

app.get('/v1/timeslots/:category_id', async (req, res) => {
  console.log('Fetching timeslots...')
  try {
    const categoryId = req.params.category_id
    if (!categoryId) {
      return res.status(400).json({ error: 'Category ID is required' })
    }
    const videos = await fetchFromTwitch(`https://api.twitch.tv/helix/videos`, {
      game_id: categoryId,
      period: 'month',
      sort: 'time',
      first: 100,
    })
    const schedule = createSchedule(videos, categoryId)
    console.log(`Fetched ${schedule.length} timeslots for category ID ${categoryId}`)
    res.json(schedule)
  } catch (error) {
    console.error('Error fetching timeslots:', error)
    res.status(500).json({ error: 'Failed to fetch timeslots' })
  }
})

// Get EPG (Aggregated timeslots for all channels)

app.get('/v1/epg', async (req, res) => {
  try {
    const epg = []
    for (const channel of channels) {
      const categoryId = channel.id
      const videos = await fetchFromTwitch(`https://api.twitch.tv/helix/videos`, {
        game_id: categoryId,
        period: 'month',
        sort: 'time',
        first: 100,
      })
      const schedule = createSchedule(videos, categoryId)
      epg.push(...schedule)
    }
    console.log(`Fetched ${epg.length} timeslots for all channels`)
    res.json(epg)
  } catch (error) {
    console.error('Error fetching EPG:', error)
    res.status(500).json({ error: 'Failed to fetch EPG' })
  }
})

// ------------ SERVER ------------

app.listen(PORT, () => console.log(`Server is running in port ${PORT}`))
