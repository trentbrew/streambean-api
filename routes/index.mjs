// routes/index.mjs
export function setupRoutes(app, controllers) {
  // Basic routes
  app.get('/', (req, res) => {
    res.send(generateIndexHtml())
  })

  app.get('/player', (req, res) => {
    const channel = req.params.channel
    const video = req.query.video
    if (channel && video) {
      return res.status(400).json({ error: 'Channel and video cannot be provided at the same time' })
    }
    res.send(generatePlayerHtml(channel, video))
  })

  // Streams routes
  app.get('/v1/streams/:category', async (req, res) => {
    try {
      const streams = await controllers.streams.getStreams(req.params.category)
      res.json(streams)
    } catch (error) {
      controllers.streams.handleError(res, error, 'Failed to fetch streams')
    }
  })

  // Categories routes
  app.get('/v1/defaults/categories', (req, res) => {
    res.json(controllers.categories.categories)
  })

  app.get('/v1/search/categories', async (req, res) => {
    const { query } = req.query
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' })
    }
    try {
      const categories = await controllers.categories.searchCategories(query)
      res.json(categories)
    } catch (error) {
      controllers.categories.handleError(res, error, 'Failed to search categories')
    }
  })

  app.get('/v1/categories/:category_id', async (req, res) => {
    try {
      const category = controllers.categories.getCategoryById(req.params.category_id)
      if (!category) {
        return res.status(404).json({ error: 'Category not found' })
      }
      res.json(category)
    } catch (error) {
      controllers.categories.handleError(res, error, 'Failed to fetch category')
    }
  })

  // Channels routes
  app.get('/v1/channels', (req, res) => {
    res.json(controllers.channels.getDefaultChannels())
  })

  app.get('/v1/search/channels', async (req, res) => {
    const { query } = req.query
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' })
    }
    try {
      const channels = await controllers.channels.searchChannels(query)
      res.json(channels)
    } catch (error) {
      controllers.channels.handleError(res, error, 'Failed to search channels')
    }
  })

  // Broadcasters routes
  app.get('/v1/broadcasters/:broadcaster_id', async (req, res) => {
    try {
      const broadcaster = await controllers.broadcasters.getBroadcaster(req.params.broadcaster_id)
      if (!broadcaster) {
        return res.status(404).json({ error: 'Broadcaster not found' })
      }
      res.json(broadcaster)
    } catch (error) {
      controllers.broadcasters.handleError(res, error, 'Failed to fetch broadcaster')
    }
  })
}
