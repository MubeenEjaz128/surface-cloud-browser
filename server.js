const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const puppeteer = require('puppeteer');

const PORT = process.env.PORT || 7860;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

let browser = null;

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;

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

function mouseButtonName(button) {
  if (button === 1) return 'middle';
  if (button === 2) return 'right';
  return 'left';
}

wss.on('connection', async (ws) => {
  console.log('[WS] Client connected');

  let page = null;
  let cdp = null;

  try {
    const b = await getBrowser();
    page = await b.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

    cdp = await page.target().createCDPSession();

    const startScreencast = async (quality = 75) => {
      try {
        await cdp.send('Page.startScreencast', {
          format: 'jpeg',
          quality,
          maxWidth: 1600,
          maxHeight: 1000,
          everyNthFrame: 1
        });
      } catch (err) {
        console.error('[CDP] Screencast start error:', err.message);
      }
    };

    cdp.on('Page.screencastFrame', async ({ data, sessionId }) => {
      try { await cdp.send('Page.screencastFrameAck', { sessionId }); } catch (e) {}
      if (ws.readyState === ws.OPEN) {
        try { ws.send(JSON.stringify({ type: 'frame', data })); } catch (e) {}
      }
    });

    page.on('framenavigated', async (frame) => {
      if (frame === page.mainFrame() && ws.readyState === ws.OPEN) {
        try {
          ws.send(JSON.stringify({
            type: 'navigated',
            url: page.url(),
            title: await page.title()
          }));
        } catch (e) {}
      }
    });

    await startScreencast(75);

    try {
      await page.goto('https://www.google.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
    } catch (e) {}

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

            ws.send(JSON.stringify({ type: 'loading', loading: true, url: targetUrl }));
            try {
              await page.goto(targetUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
              });
            } catch (navErr) {
              console.warn('[Page] Navigation warning:', navErr.message);
            } finally {
              ws.send(JSON.stringify({ type: 'loading', loading: false, url: page.url() }));
            }
            break;
          }

          case 'click': {
            if (page && typeof msg.x === 'number' && typeof msg.y === 'number') {
              await page.mouse.click(msg.x, msg.y, {
                button: mouseButtonName(msg.button),
                clickCount: msg.clickCount || 1
              });
            }
            break;
          }

          case 'mousedown': {
            if (page && typeof msg.x === 'number' && typeof msg.y === 'number') {
              await page.mouse.move(msg.x, msg.y);
              await page.mouse.down({ button: mouseButtonName(msg.button) });
            }
            break;
          }

          case 'mouseup': {
            if (page && typeof msg.x === 'number' && typeof msg.y === 'number') {
              await page.mouse.move(msg.x, msg.y);
              await page.mouse.up({ button: mouseButtonName(msg.button) });
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
            if (page) {
              await page.mouse.wheel({
                deltaX: typeof msg.deltaX === 'number' ? msg.deltaX : 0,
                deltaY: typeof msg.deltaY === 'number' ? msg.deltaY : 0
              });
            }
            break;
          }

          case 'type': {
            if (page && typeof msg.text === 'string' && msg.text.length) {
              await page.keyboard.type(msg.text);
            }
            break;
          }

          case 'keypress': {
            if (page && msg.key) {
              await page.keyboard.press(msg.key);
            }
            break;
          }

          case 'back':
            try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }); } catch (e) {}
            break;

          case 'forward':
            try { await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 }); } catch (e) {}
            break;

          case 'reload':
            try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }); } catch (e) {}
            break;

          case 'quality': {
            const q = Math.max(35, Math.min(92, parseInt(msg.quality, 10) || 75));
            try { await cdp.send('Page.stopScreencast'); } catch (e) {}
            await startScreencast(q);
            break;
          }

          case 'resize': {
            const w = Math.min(Math.max(parseInt(msg.width, 10) || 1280, 800), 1600);
            const h = Math.min(Math.max(parseInt(msg.height, 10) || 720, 500), 1000);
            await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
            try { await cdp.send('Page.stopScreencast'); } catch (e) {}
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
      try { ws.send(JSON.stringify({ type: 'error', message: err.message })); } catch (e) {}
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
  console.log('====================================================');
  console.log(' Surface Cloud Browser Server Running on Port ' + PORT + ' ');
  console.log('====================================================');
});