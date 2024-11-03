# Streambean API

This API is designed to interact with Twitch data, providing endpoints to fetch streams, categories, and scheduled streams based on broadcaster IDs.

## Features

- **Stream Fetching**: Retrieve live Twitch streams with detailed information including custom player URLs.
- **Category Listing**: Get a list of top game categories from Twitch.
- **Schedule Fetching**: Obtain scheduled streams for specific Twitch broadcasters.

## Endpoints

1. **Home (`https://api.streambean.tv/`)**:

   - For funzies

2. **Player (`https://api.streambean.tv/player/:channel_name`)**:

   - Dynamic endpoint to fetch and display a Twitch player for the specified channel.
   - Channel is the Twitch streamer's `login_name`

3. **Streams (`https://api.streambean.tv/v1/streams`)**:

   - Fetches live streams from Twitch, enriching each stream with additional data like custom player URLs.

4. **Categories (`https://api.streambean.tv/v1/categories`)**:

   - Retrieves a list of current top game categories from Twitch.

5. **Schedule (`https://api.streambean.tv/v1/schedule/:broadcaster_id`)**:
   - Provides the schedule of upcoming streams for a specified broadcaster ID.

## Setup and Configuration

Ensure you have the following environment variables set:

- `TWITCH_CLIENT_ID`: Your Twitch client ID.
- `TWITCH_CLIENT_SECRET`: Your Twitch client secret.
- `NODE_ENV`: Should be set to `production` or `development` to determine the base URL.

## Running the Server

The server runs on port 8018 by default and can be started with standard Node.js commands.
