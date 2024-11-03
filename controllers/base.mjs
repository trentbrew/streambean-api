// controllers/base.mjs
export class BaseController {
  constructor(twitchService) {
    this.twitchService = twitchService
  }

  handleError(res, error, message) {
    console.error(message, error)
    res.status(500).json({ error: message })
  }
}
