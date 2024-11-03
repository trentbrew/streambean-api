import { BaseController } from './base.mjs'

export class CategoriesController extends BaseController {
  constructor(twitchService, categories) {
    super(twitchService)
    this.categories = categories
  }

  async searchCategories(query) {
    const categories = await this.twitchService.fetchFromTwitch('https://api.twitch.tv/helix/search/categories', { query, first: 20 })
    return categories.map(this.formatCategory)
  }

  formatCategory(category) {
    return {
      id: category.id,
      name: category.name,
      boxArtUrl: category.box_art_url,
    }
  }

  getCategoryById(categoryId) {
    return Object.values(this.categories).find((cat) => cat.id === categoryId)
  }
}
