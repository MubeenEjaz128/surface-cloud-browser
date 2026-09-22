const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const puppeteer = require('puppeteer');

const PORT = process.env.PORT || 7860;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve static assets from public/
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

let browser = null;

async function getBrowser() {
  if (browser && browser.isConnected()) {
    return browser;
  }

  const launchOptions = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--window-size=1280,720',
      '--autoplay-policy=no-user-gesture-required'
    ]
  };

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  console.log('[Server] Launching Chromium instance...');
  browser = await puppeteer.launch(launchOptions);
  return browser;
}

wss.on('connection', async (ws) => {
  console.log('[WS] Client connected from Surface / browser');

  let page = null;
  let cdp = null;
  let isNavigating = false;

  try {
    const b = await getBrowser();
    page = await b.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

    // Enable screencast via Chrome DevTools Protocol
    cdp = await page.target().createCDPSession();

    const startScreencast = async (quality = 70) => {
      try {
        await cdp.send('Page.startScreencast', {
          format: 'jpeg',
          quality: quality,
          maxWidth: 1280,
          maxHeight: 720,
          everyNthFrame: 1
        });
      } catch (err) {
        console.error('[CDP] Screencast start error:', err.message);
      }
    };

    cdp.on('Page.screencastFrame', async ({ data, sessionId }) => {
      try {
        await cdp.send('Page.screencastFrameAck', { sessionId });
      } catch (e) {}

      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'frame', data }));
      }
    });

    page.on('framenavigated', async (frame) => {
      if (frame === page.mainFrame() && ws.readyState === ws.OPEN) {
        try {
          const url = page.url();
          const title = await page.title();
          ws.send(JSON.stringify({ type: 'navigated', url, title }));
        } catch (e) {}
      }
    });

    await startScreencast(75);

    // Initial default page
    await page.goto('https://www.google.com', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    ws.on('message', async (rawMsg) => {
      try {
        const msg = JSON.parse(rawMsg.toString());

        switch (msg.type) {
          case 'navigate': {
            let targetUrl = msg.url ? msg.url.trim() : '';
            if (!targetUrl) return;
            if (!/^https?:\/\//i.test(targetUrl)) {
              if (targetUrl.includes('.') && !targetUrl.includes(' ')) {
                targetUrl = 'https://' + targetUrl;
              } else {
                targetUrl = 'https://www.google.com/search?q=' + encodeURIComponent(targetUrl);
              }
            }
            isNavigating = true;
            ws.send(JSON.stringify({ type: 'loading', loading: true, url: targetUrl }));
            try {
              await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            } catch (navErr) {
              console.warn('[Page] Navigation warning:', navErr.message);
            } finally {
              isNavigating = false;
              ws.send(JSON.stringify({ type: 'loading', loading: false, url: page.url() }));
            }
            break;
          }

          case 'click': {
            if (page && typeof msg.x === 'number' && typeof msg.y === 'number') {
              await page.mouse.click(msg.x, msg.y);
            }
            break;
          }

          case 'mousedown': {
            if (page && typeof msg.x === 'number' && typeof msg.y === 'number') {
              await page.mouse.down();
            }
            break;
          }

          case 'mouseup': {
            if (page && typeof msg.x === 'number' && typeof msg.y === 'number') {
              await page.mouse.up();
            }
            break;
          }

          case 'mousemove': {
            if (page && typeof msg.x === 'number' && typeof msg.y === 'number') {
              await page.mouse.move(msg.x, msg.y);
            }
            break;
          }

          case 'scroll': {
            if (page && typeof msg.deltaY === 'number') {
              await page.mouse.wheel({
                deltaX: msg.deltaX || 0,
                deltaY: msg.deltaY
              });
            }
            break;
          }

          case 'type': {
            if (page && msg.text) {
              await page.keyboard.type(msg.text);
            }
            break;
          }

          case 'keypress': {
            if (page && msg.key) {
              if (msg.key === 'Enter') {
                await page.keyboard.press('Enter');
              } else if (msg.key === 'Backspace') {
                await page.keyboard.press('Backspace');
              } else if (msg.key === 'Tab') {
                await page.keyboard.press('Tab');
              } else if (msg.key === 'Escape') {
                await page.keyboard.press('Escape');
              } else {
                await page.keyboard.press(msg.key);
              }
            }
            break;
          }

          case 'back': {
            if (page) {
              try { await page.goBack(); } catch (e) {}
            }
            break;
          }

          case 'forward': {
            if (page) {
              try { await page.goForward(); } catch (e) {}
            }
            break;
          }

          case 'reload': {
            if (page) {
              try { await page.reload(); } catch (e) {}
            }
            break;
          }

          case 'quality': {
            const q = parseInt(msg.quality, 10) || 70;
            await cdp.send('Page.stopScreencast');
            await startScreencast(q);
            break;
          }

          case 'resize': {
            const w = Math.min(Math.max(parseInt(msg.width, 10) || 1280, 800), 1920);
            const h = Math.min(Math.max(parseInt(msg.height, 10) || 720, 600), 1080);
            await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
            await cdp.send('Page.stopScreencast');
            await startScreencast(75);
            break;
          }
        }
      } catch (msgErr) {
        console.error('[WS] Message processing error:', msgErr.message);
      }
    });

  } catch (err) {
    console.error('[WS] Session initialization error:', err.message);
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  }

  ws.on('close', async () => {
    console.log('[WS] Client disconnected. Cleaning up session...');
    if (cdp) {
      try { await cdp.detach(); } catch (e) {}
    }
    if (page) {
      try { await page.close(); } catch (e) {}
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(` Surface Cloud Browser Server Running on Port ${PORT} `);
  console.log(` Open in Surface IE11: http://localhost:${PORT}        `);
  console.log(`====================================================`);
});
