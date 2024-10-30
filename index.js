require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");

const app = express();

app.set("view engine", "ejs");
app.set("views", "./views");

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

/**
 * Port number for server.
 * @type {number}
 */
const PORT = process.env.PORT || 8018;

/**
 * Base URL for the API, differing in production and development.
 * @type {string}
 */
const BASE_URL =
  process.env.NODE_ENV === "production"
    ? "https://api.streambean.tv"
    : `http://localhost:${PORT}`;

/**
 * Twitch Client ID.
 * @type {string}
 */
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;

/**
 * Twitch Client Secret.
 * @type {string}
 */
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

/**
 * Categories mapping for stream content.
 * @type {Object}
 */
const categories = {
  gaming: { id: "000000", name: "Gaming" },
  irl: { id: "509660", name: "IRL" },
  "just-chatting": { id: "509658", name: "Just Chatting" },
  asmr: { id: "509659", name: "ASMR" },
  music: { id: "26936", name: "Music" },
  art: { id: "509664", name: "Art" },
  djs: { id: "1669431183", name: "DJs" },
  "animals-aquariums-and-zoos": {
    id: "272263131",
    name: "Animals, Aquariums, and Zoos",
  },
  sports: { id: "518203", name: "Sports" },
  "talk-shows-and-podcasts": { id: "417752", name: "Talk Shows and Podcasts" },
  "co-working-and-studying": {
    id: "1599346425",
    name: "Co-working and Studying",
  },
  "software-and-game-development": {
    id: "1469308723",
    name: "Software and Game Development",
  },
  "miniatures-and-models": { id: "1397210469", name: "Miniatures and Models" },
  "makers-and-crafting": { id: "509673", name: "Makers and Crafting" },
  "food-and-drink": { id: "509667", name: "Food and Drink" },
  "writing-and-reading": { id: "772157971", name: "Writing and Reading" },
};

// ------------ HELPERS ------------

/**
 * Gets an access token from Twitch.
 * @returns {Promise<string|null>} Twitch access token or null if there is an error.
 */
async function getTwitchAccessToken() {
  console.log("Getting Twitch access token...");
  try {
    const response = await axios.post(
      `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    );
    return response.data.access_token;
  } catch (error) {
    console.error("Error getting Twitch access token:", error);
    return null;
  }
}

/**
 * Fetches data from the Twitch API.
 * @param {string} url - The Twitch API endpoint URL.
 * @param {Object} [params={}] - Optional query parameters.
 * @returns {Promise<Object[]>} The data retrieved from Twitch.
 * @throws Will throw an error if access token cannot be obtained.
 */
async function fetchFromTwitch(url, params = {}) {
  const accessToken = await getTwitchAccessToken();
  if (!accessToken) {
    throw new Error("Failed to get access token");
  }
  const response = await axios.get(url, {
    headers: {
      "Client-ID": TWITCH_CLIENT_ID,
      Authorization: `Bearer ${accessToken}`,
    },
    params,
  });
  return response.data.data;
}

/**
 * Extracts broadcaster IDs from an array of Twitch stream objects.
 * @param {Object[]} responseArray - The array of Twitch stream objects.
 * @returns {string[]} Array of broadcaster IDs.
 */
function getBroadcasterIds(responseArray) {
  return responseArray.map((item) => item.user_id);
}

/**
 * Retrieves schedule data for a list of broadcasters.
 * @param {string[]} ids - Array of broadcaster IDs.
 * @returns {Promise<Object[]>} Array of schedule items.
 */
async function getBroadcasterSchedules(ids) {
  const schedulePromises = ids.map(async (id) => {
    try {
      const scheduleData = await fetchFromTwitch(
        "https://api.twitch.tv/helix/schedule",
        { broadcaster_id: id },
      );
      const segments =
        scheduleData?.segments?.map((segment) => {
          const { start_time, end_time, ...rest } = segment;
          return {
            broadcaster_id: id,
            since: start_time,
            till: end_time,
            channelUuid: rest.category.id,
            ...rest,
          };
        }) || [];
      return segments;
    } catch (error) {
      console.error(`Error fetching schedule for broadcaster ${id}:`, error);
      return [];
    }
  });
  const schedulesArray = await Promise.all(schedulePromises);
  return schedulesArray.flat();
}

/**
 * Adjusts overlapping schedule items to create a more accurate timeline.
 * @param {Object[]} scheduleItems - Array of schedule items to adjust.
 * @returns {Promise<Object[]>} Adjusted schedule items.
 */
async function adjustScheduleItems(scheduleItems) {
  const sortedItems = scheduleItems.sort(
    (a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );
  const adjustedSchedule = [];
  for (const item of sortedItems) {
    if (adjustedSchedule.length === 0) {
      adjustedSchedule.push(item);
      continue;
    }
    const lastItem = adjustedSchedule[adjustedSchedule.length - 1];
    const lastEnd = new Date(lastItem.end_time).getTime();
    const currentStart = new Date(item.start_time).getTime();
    if (currentStart < lastEnd) {
      item.start_time = new Date(lastEnd).toISOString();
    }
    if (
      !(
        item.start_time === lastItem.start_time &&
        item.end_time === lastItem.end_time
      )
    ) {
      adjustedSchedule.push(item);
    }
  }
  return adjustedSchedule;
}

// ------------ ROUTES ------------

// Start of Selection
app.get("/", (req, res) => {
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
      `;
  res.send(iframeContent);
});

app.get("/player/:channel_name", (req, res) => {
  const channel = req.params.channel_name;
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
                  if (event.message.includes('aria-hidden')) {
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
      `;
  res.send(htmlContent);
});

app.get("/streams/:category", async (req, res) => {
  console.log("Fetching streams...");
  try {
    const category = req.params.category;
    if (!category) {
      return res.status(400).json({ error: "Category is required" });
    }
    const streams = await fetchFromTwitch(
      `https://api.twitch.tv/helix/streams?game_id=${categories[category].id}`,
      {
        first: 100,
      },
    );
    const enrichedStreams = streams.map((stream) => ({
      ...stream,
      player_url: `${BASE_URL}/player/${stream.user_login}`,
      thumbnail_url: stream.thumbnail_url
        ?.replace("{width}", "960")
        ?.replace("{height}", "540"),
    }));
    return res.json(enrichedStreams);
  } catch (error) {
    console.error("Error fetching Twitch streams:", error);
    return res.status(500).json({ error: "Failed to fetch streams" });
  }
});

app.get("/categories", (req, res) => {
  return res.json(categories);
});

app.get("/schedule/:broadcaster_id", async (req, res) => {
  console.log("Fetching scheduled streams...");
  try {
    const broadcasterId = req.params.broadcaster_id;
    if (!broadcasterId) {
      return res.status(400).json({ error: "Broadcaster ID is required" });
    }
    const schedule = await fetchFromTwitch(
      `https://api.twitch.tv/helix/schedule?broadcaster_id=${broadcasterId}`,
    ).catch((error) => {
      console.error("Error fetching scheduled streams:", error);
      return [];
    });
    const formattedSchedule = schedule?.segments?.map((segment) => ({
      id: segment.id,
      startTime: segment.start_time,
      endTime: segment.end_time,
      title: segment.title,
      isRecurring: segment.is_recurring,
    }));
    return res.json(formattedSchedule);
  } catch (error) {
    console.error("Error fetching scheduled streams:", error);
    return res.status(500).json({ error: "Failed to fetch scheduled streams" });
  }
});

app.get("/videos/:broadcaster_id", async (req, res) => {
  console.log("Fetching videos...");
  try {
    const broadcasterId = req.params.broadcaster_id;
    if (!broadcasterId) {
      return res.status(400).json({ error: "Broadcaster ID is required" });
    }
    const videos = await fetchFromTwitch(`https://api.twitch.tv/helix/videos`, {
      user_id: broadcasterId,
      first: 100,
    });
    const formattedVideos = videos.map((video) => ({
      id: video.id,
      title: video.title,
      thumbnailUrl: video.thumbnail_url,
      url: video.url,
      publishedAt: video.published_at,
      duration: video.duration,
      viewCount: video.view_count,
    }));
    return res.json(formattedVideos);
  } catch (error) {
    console.error("Error fetching videos:", error);
    return res.status(500).json({ error: "Failed to fetch videos" });
  }
});

app.get("/search/categories", async (req, res) => {
  console.log("Searching categories...");
  try {
    const query = req.query.query;
    if (!query) {
      return res.status(400).json({ error: "Search query is required" });
    }
    const categoriesResult = await fetchFromTwitch(
      "https://api.twitch.tv/helix/search/categories",
      {
        query: query,
        first: 20,
      },
    );
    const formattedCategories = categoriesResult.map((category) => ({
      id: category.id,
      name: category.name,
      boxArtUrl: category.box_art_url,
    }));
    return res.json(formattedCategories);
  } catch (error) {
    console.error("Error searching categories:", error);
    return res.status(500).json({ error: "Failed to search categories" });
  }
});

app.get("/search/channels", async (req, res) => {
  console.log("Searching channels...");
  try {
    const query = req.query.query;
    if (!query) {
      return res.status(400).json({ error: "Search query is required" });
    }
    const channels = await fetchFromTwitch(
      "https://api.twitch.tv/helix/search/channels",
      {
        query: query,
        first: 20,
        live_only: false,
      },
    );
    const formattedChannels = channels.map((channel) => ({
      id: channel.id,
      displayName: channel.display_name,
      name: channel.broadcaster_login,
      thumbnailUrl: channel.thumbnail_url,
      isLive: channel.is_live,
      gameId: channel.game_id,
      gameName: channel.game_name,
    }));
    return res.json(formattedChannels);
  } catch (error) {
    console.error("Error searching channels:", error);
    return res.status(500).json({ error: "Failed to search channels" });
  }
});

app.get("/broadcasters/:broadcaster_id", async (req, res) => {
  console.log("Fetching channel information...");
  try {
    const broadcasterId = req.params.broadcaster_id;
    if (!broadcasterId) {
      return res.status(400).json({ error: "Broadcaster ID is required" });
    }
    const [channelData, scheduleData] = await Promise.all([
      fetchFromTwitch(`https://api.twitch.tv/helix/channels`, {
        broadcaster_id: broadcasterId,
      }),
      fetchFromTwitch(
        `https://api.twitch.tv/helix/schedule?broadcaster_id=${broadcasterId}`,
      ).catch((error) => {
        console.error("Error fetching scheduled streams:", error);
        return [];
      }),
    ]);
    const channel = channelData[0];
    if (!channel) {
      return res.status(404).json({ error: "Broadcaster not found" });
    }
    const formattedSchedule = scheduleData?.segments?.map((segment) => ({
      id: segment.id,
      startTime: segment.start_time,
      endTime: segment.end_time,
      title: segment.title,
      isRecurring: segment.is_recurring,
    }));
    return res.json({
      id: channel.broadcaster_id,
      name: channel.broadcaster_name,
      category_name: channel.game_name,
      category_id: channel.game_id,
      tags: channel.tags || [],
      schedule: formattedSchedule || [],
    });
  } catch (error) {
    console.error("Error fetching channel information:", error);
    return res
      .status(500)
      .json({ error: "Failed to fetch channel information" });
  }
});

app.get("/timeslots", async (req, res) => {
  console.log("Fetching timeslots...");
  try {
    const category = req.query.category;
    if (!category) {
      return res
        .status(400)
        .json({ error: "Category query parameter is required" });
    }
    const categoryData = categories[category];
    if (!categoryData) {
      return res.status(400).json({ error: "Invalid category" });
    }
    const streams = await fetchFromTwitch(
      `https://api.twitch.tv/helix/streams?game_id=${categoryData.id}`,
      {
        first: 100,
      },
    );
    const broadcasterIds = getBroadcasterIds(streams);
    if (broadcasterIds.length === 0) {
      return res.json({ timeslots: [] });
    }
    const scheduleItems = await getBroadcasterSchedules(broadcasterIds);
    const adjustedSchedule = await adjustScheduleItems(scheduleItems);
    return res.json(adjustedSchedule);
  } catch (error) {
    console.error("Error fetching timeslots:", error);
    return res.status(500).json({ error: "Failed to fetch timeslots" });
  }
});

app.listen(PORT, () => console.log(`Server is running in port ${PORT}`));
