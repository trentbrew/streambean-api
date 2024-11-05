// index.mjs

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
    const response = await axios.post(`https://id.twitch.tv/oauth2/token`, null, {
      params: {
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        grant_type: 'client_credentials',
      },
    })
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
  try {
    const response = await axios.get(url, {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        Authorization: `Bearer ${twitchAccessToken}`,
        'Content-Type': 'application/json',
      },
      params,
    })
    return response.data.data || []
  } catch (error) {
    if (error.response && error.response.status === 401) {
      // Token might have expired, refresh it
      twitchAccessToken = await getTwitchAccessToken()
      return fetchFromTwitch(url, params)
    } else {
      throw error
    }
  }
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
            channelUuid: rest.category?.id,
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

async function fetchVideosByCategoryId(categoryId) {
  try {
    const videos = await fetchFromTwitch(`https://api.twitch.tv/helix/videos`, {
      game_id: categoryId,
      period: 'month',
      sort: 'time',
      language: 'en',
      first: 100,
    })

    console.log(`Fetched ${videos.length} videos for category ID ${categoryId}`)
    return videos
  } catch (error) {
    console.error(`Error fetching videos for category ID ${categoryId}:`, error)
    return []
  }
}

// Middleware to handle JSON parsing errors
app.use(function (err, req, res, next) {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('Bad JSON:', err.message)
    return res.status(400).json({ error: 'Invalid JSON' })
  }
  next()
})

// ------------ ROUTES ------------

// Render index
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

// Render player
app.get('/player/channel/:channel_id', (req, res) => {
  const channel = req.params.channel_id
  if (!channel) {
    return res.status(400).json({ error: 'Channel ID is required' })
  }
  const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Streambean Player | ${channel}</title>
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
                  if (event.message?.includes('aria-hidden')) {
                    event.preventDefault();
                  }
                },
                true,
              );
            </script>
            <script type="text/javascript">
              new Twitch.Player('twitch-embed', {
                channel: '${channel}',
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

app.get('/player/video/:video_id', (req, res) => {
  const videoId = req.params.video_id
  if (!videoId) {
    return res.status(400).json({ error: 'Video ID is required' })
  }
  const videoUrl = `https://player.twitch.tv/?video=${videoId}&parent=www.streambean.tv&parent=localhost&parent=streambeanm.tv&parent=api.streambean.tv`
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
            <iframe src="${videoUrl}" frameborder="0" allowfullscreen></iframe>
          </body>
        </html>
      `
  res.send(iframeContent)
})

// Get streams by category
app.get('/v1/streams/:category', async (req, res) => {
  console.log('Fetching streams...')
  try {
    const category = req.params.category
    if (!category) {
      return res.status(400).json({ error: 'Category is required' })
    }

    let streams
    if (category === 'top') {
      streams = await fetchFromTwitch('https://api.twitch.tv/helix/streams', {
        first: 100,
      })
    } else {
      const categoryData = categories[category]
      if (!categoryData) {
        return res.status(400).json({ error: 'Invalid category' })
      }
      streams = await fetchFromTwitch('https://api.twitch.tv/helix/streams', {
        game_id: categoryData.id,
        first: 100,
      })
    }

    const enrichedStreams = streams.map((stream) => ({
      ...stream,
      player_url: `${BASE_URL}/player/channel/${stream.user_login}`,
      thumbnail_url: stream.thumbnail_url?.replace('{width}', '960')?.replace('{height}', '540'),
    }))
    return res.json(enrichedStreams || [])
  } catch (error) {
    console.error('Error fetching Twitch streams:', error)
    return res.status(500).json({ error: 'Failed to fetch streams' })
  }
})

app.get('/v1/defaults/categories', (req, res) => {
  return res.json(categories || [])
})

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
    return res.json(category || [])
  } catch (error) {
    console.error('Error fetching category by ID:', error)
    return res.status(500).json({ error: 'Failed to fetch category' })
  }
})

// Get schedule by broadcaster ID
app.get('/v1/schedule/:broadcaster_id', async (req, res) => {
  console.log('Fetching scheduled streams...')
  try {
    const broadcasterId = req.params.broadcaster_id
    if (!broadcasterId) {
      return res.status(400).json({ error: 'Broadcaster ID is required' })
    }
    const scheduleData = await fetchFromTwitch('https://api.twitch.tv/helix/schedule', { broadcaster_id: broadcasterId }).catch((error) => {
      console.error('Error fetching scheduled streams:', error)
      return []
    })
    const formattedSchedule =
      scheduleData?.segments?.map((segment) => ({
        id: segment.id,
        startTime: segment.start_time,
        endTime: segment.end_time,
        title: segment.title,
        isRecurring: segment.is_recurring,
      })) || []
    console.log(`Fetched ${formattedSchedule.length} schedule items`)
    return res.json(formattedSchedule || [])
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
    if (!category) {
      return res.status(400).json({ error: 'Category query parameter is required' })
    }
    const since = req.query.since || new Date().toISOString()
    const till = req.query.till || new Date().toISOString()

    const categoryData = categories[category]
    if (!categoryData) {
      return res.status(400).json({ error: 'Invalid category' })
    }
    const streams = await fetchFromTwitch('https://api.twitch.tv/helix/streams', {
      game_id: categoryData.id,
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

// Get videos by game ID
app.get('/v1/videos/:game_id', async (req, res) => {
  console.log('Fetching videos...')
  try {
    const game_id = req.params.game_id
    if (!game_id) {
      return res.status(400).json({ error: 'Game ID is required' })
    }
    const videos = await fetchVideosByCategoryId(game_id)
    const adjustedVideos = videos.map((video) => ({
      ...video,
      thumbnail_url: video.thumbnail_url?.replace('{width}', '960')?.replace('{height}', '540'),
    }))
    console.log(`Fetched ${videos.length} videos for game ID ${game_id}`)
    if (adjustedVideos && adjustedVideos.length > 0) {
      return res.json(adjustedVideos || [])
    } else {
      return res.status(404).json({ error: 'No videos found' })
    }
  } catch (error) {
    console.error('Error fetching videos:', error)
    return res.status(500).json({ error: 'Failed to fetch videos' })
  }
})

// List default channels
app.get('/v1/channels', (req, res) => {
  return res.json(channels || [])
})

// Search channels
app.get('/v1/search/channels', async (req, res) => {
  console.log('Searching channels...')
  try {
    const query = req.query.query
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' })
    }
    const channelsResult = await fetchFromTwitch('https://api.twitch.tv/helix/search/channels', {
      query: query,
      first: 20,
      live_only: false,
    })
    const formattedChannels = channelsResult.map((channel) => ({
      id: channel.id,
      displayName: channel.display_name,
      name: channel.broadcaster_login,
      thumbnailUrl: channel.thumbnail_url,
      isLive: channel.is_live,
      gameId: channel.game_id,
      gameName: channel.game_name,
    }))
    console.log(`Fetched ${formattedChannels.length} channels`)
    return res.json(formattedChannels || [])
  } catch (error) {
    console.error('Error searching channels:', error)
    return res.status(500).json({ error: 'Failed to search channels' })
  }
})

// Get broadcaster by ID
app.get('/v1/broadcasters/:broadcaster_id', async (req, res) => {
  console.log('Fetching channel information...')
  try {
    const broadcasterId = req.params.broadcaster_id
    if (!broadcasterId) {
      return res.status(400).json({ error: 'Broadcaster ID is required' })
    }
    const [channelData, scheduleData] = await Promise.all([
      fetchFromTwitch('https://api.twitch.tv/helix/channels', {
        broadcaster_id: broadcasterId,
      }),
      fetchFromTwitch('https://api.twitch.tv/helix/schedule', {
        broadcaster_id: broadcasterId,
      }).catch((error) => {
        console.error('Error fetching scheduled streams:', error)
        return []
      }),
    ])
    const channel = channelData[0]
    if (!channel) {
      return res.status(404).json({ error: 'Broadcaster not found' })
    }
    const formattedSchedule =
      scheduleData?.segments?.map((segment) => ({
        id: segment.id,
        startTime: segment.start_time,
        endTime: segment.end_time,
        title: segment.title,
        isRecurring: segment.is_recurring,
      })) || []
    return res.json({
      id: channel.broadcaster_id,
      name: channel.broadcaster_name,
      category_name: channel.game_name,
      category_id: channel.game_id,
      tags: channel.tags || [],
      schedule: formattedSchedule,
    })
  } catch (error) {
    console.error('Error fetching channel information:', error)
    return res.status(500).json({ error: 'Failed to fetch channel information' })
  }
})

// Get timeslots by category
app.get('/v1/timeslots/:category_id', async (req, res) => {
  console.log('Fetching timeslots...')
  try {
    const categoryId = req.params.category_id
    if (!categoryId) {
      return res.status(400).json({ error: 'Category ID is required' })
    }
    const videos = await fetchVideosByCategoryId(categoryId)
    const videoArray = Array.isArray(videos) ? videos : []
    const schedule = createSchedule(videoArray, categoryId)
    console.log(`Fetched ${schedule.length} timeslots for category ID ${categoryId}`)
    res.json(schedule || [])
  } catch (error) {
    console.error('Error fetching timeslots:', error)
    res.status(500).json({ error: 'Failed to fetch timeslots' })
  }
})

// Get EPG (Aggregated timeslots for all channels)
app.get('/v1/epg', async (req, res) => {
  try {
    const epg = []
    const schedulePromises = channels.map(async (channel) => {
      const videos = await fetchVideosByCategoryId(channel.uuid)
      const videoArray = Array.isArray(videos) ? videos : []
      const schedule = createSchedule(videoArray, channel.uuid)
      console.log(`Scheduled ${schedule.length} timeslots for ${channel.title}`)
      return schedule
    })

    const schedulesArray = await Promise.all(schedulePromises)
    epg.push(...schedulesArray.flat())
    console.log(`Fetched ${epg.length} timeslots for all channels`)

    res.json(
      epg?.filter((item) => {
        const itemDate = new Date(item.since)
        const today = new Date()
        return itemDate.toDateString() === today.toDateString()
      }) || [],
    )
  } catch (error) {
    console.error('Error fetching EPG:', error)
    res.status(500).json({ error: 'Failed to fetch EPG' })
  }
})

// backend auth routes
app.post('/auth/twitch/callback', async (req, res) => {
  try {
    const { code, code_verifier } = req.body

    if (!code || !code_verifier) {
      return res.status(400).json({ error: 'Missing required parameters' })
    }

    const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        code,
        code_verifier,
        grant_type: 'authorization_code',
        redirect_uri: process.env.NODE_ENV === 'production' ? 'https://watch.streambean.tv/auth/callback' : 'http://localhost:8080/auth/callback',
      },
    })
    res.json(response.data)
  } catch (error) {
    console.error('Token exchange failed:', error.message)
    res.status(500).json({ error: 'Authentication failed' })
  }
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal Server Error' })
})

// ------------ SERVER ------------

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`))
