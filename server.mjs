// server.mjs
import express from 'express'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'

import { setupMiddleware } from './middleware/index.mjs'
import { TwitchService } from './services/twitch.mjs'
import { StreamsController } from './controllers/streams.mjs'
import { CategoriesController } from './controllers/categories.mjs'
import { ChannelsController } from './controllers/channels.mjs'
import { BroadcastersController } from './controllers/broadcasters.mjs'
import { setupRoutes } from './routes/index.mjs'
import { channels } from './helpers/channels.mjs'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
setupMiddleware(app)

const PORT = process.env.PORT || 8018
const BASE_URL = process.env.NODE_ENV === 'production' ? 'https://api.streambean.tv' : `http://localhost:${PORT}`

const twitchService = new TwitchService(process.env.TWITCH_CLIENT_ID, process.env.TWITCH_CLIENT_SECRET)

const controllers = {
  streamsController: new StreamsController(twitchService, BASE_URL, channels),
  categoriesController: new CategoriesController(twitchService, channels),
  channelsController: new ChannelsController(twitchService, channels),
  broadcastersController: new BroadcastersController(twitchService),
}

setupRoutes(app, controllers)

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`))
