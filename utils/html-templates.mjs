// utils/html-templates.mjs
export const generatePlayerHtml = (channel, video) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Streambean Player | ${channel || video}</title>
    <style>
      body, html {
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
      window.addEventListener('error', function(event) {
        if (event.message.includes('aria-hidden')) {
          event.preventDefault();
        }
      }, true);
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

export const generateIndexHtml = () => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Streambean API</title>
    <style>
      body, html {
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
