/* ==============================================================================
   Cloud Web Browser - Client Application
   STRICT ECMAScript 5 (ES5) - 100% Compatible with Internet Explorer 11 & Modern Browsers
   ============================================================================== */

(function () {
  'use strict';

  // DOM Elements
  var canvas = document.getElementById('screenCanvas');
  var ctx = canvas.getContext('2d');
  var urlInput = document.getElementById('urlInput');
  var btnGo = document.getElementById('btnGo');
  var btnBack = document.getElementById('btnBack');
  var btnForward = document.getElementById('btnForward');
  var btnReload = document.getElementById('btnReload');
  var qualitySelect = document.getElementById('qualitySelect');
  var statusBadge = document.getElementById('statusBadge');
  var loadingBar = document.getElementById('loadingBar');
  var overlay = document.getElementById('overlay');
  var overlayTitle = document.getElementById('overlayTitle');
  var overlayMsg = document.getElementById('overlayMsg');
  var btnReconnect = document.getElementById('btnReconnect');
  var btnKeyboard = document.getElementById('btnKeyboard');
  var keyboardDrawer = document.getElementById('keyboardDrawer');
  var typeInput = document.getElementById('typeInput');
  var btnSendText = document.getElementById('btnSendText');
  var btnSendEnter = document.getElementById('btnSendEnter');
  var btnSendBack = document.getElementById('btnSendBack');
  var btnCloseKbd = document.getElementById('btnCloseKbd');

  var ws = null;
  var reconnectTimer = null;
  var isConnected = false;
  var frameImg = new Image();
  var isRendering = false;

  // Touch tracking for drag / scroll
  var touchStartX = 0;
  var touchStartY = 0;
  var lastTouchTime = 0;

  // --- WebSocket Connection ---
  function getWebSocketUrl() {
    var loc = window.location;
    var proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + loc.host;
  }

  function setStatus(status) {
    statusBadge.className = 'status-badge status-' + status;
    if (status === 'connected') {
      overlay.style.display = 'none';
      isConnected = true;
    } else if (status === 'connecting') {
      overlay.style.display = 'flex';
      overlayTitle.innerText = 'Connecting to Cloud Browser...';
      overlayMsg.innerText = 'Initializing remote Chromium session in the cloud.';
      btnReconnect.style.display = 'none';
      isConnected = false;
    } else {
      overlay.style.display = 'flex';
      overlayTitle.innerText = 'Connection Lost';
      overlayMsg.innerText = 'Disconnected from Cloud Browser. Attempting to reconnect...';
      btnReconnect.style.display = 'inline-block';
      isConnected = false;
    }
  }

  function connect() {
    if (ws) {
      try { ws.close(); } catch (e) {}
    }

    setStatus('connecting');
    var wsUrl = getWebSocketUrl();

    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      console.error('WebSocket creation failed: ' + err.message);
      setStatus('disconnected');
      scheduleReconnect();
      return;
    }

    ws.onopen = function () {
      console.log('Connected to Cloud Browser');
      setStatus('connected');
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    ws.onmessage = function (event) {
      try {
        var msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (err) {
        console.error('Error parsing incoming message: ' + err.message);
      }
    };

    ws.onclose = function () {
      console.warn('WebSocket connection closed.');
      setStatus('disconnected');
      scheduleReconnect();
    };

    ws.onerror = function (err) {
      console.error('WebSocket error:', err);
    };
  }

  function scheduleReconnect() {
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(function () {
        reconnectTimer = null;
        connect();
      }, 3000);
    }
  }

  function send(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  // --- Message Dispatcher ---
  function handleServerMessage(msg) {
    if (msg.type === 'frame') {
      renderFrame(msg.data);
    } else if (msg.type === 'navigated') {
      if (msg.url) {
        urlInput.value = msg.url;
      }
      if (msg.title) {
        document.title = msg.title + ' - Cloud Browser';
      }
    } else if (msg.type === 'loading') {
      if (msg.loading) {
        loadingBar.className = 'loading-bar loading-active';
      } else {
        loadingBar.className = 'loading-bar';
      }
    } else if (msg.type === 'error') {
      alert('Cloud Browser Error: ' + msg.message);
    }
  }

  function renderFrame(base64Data) {
    frameImg.onload = function () {
      ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);
    };
    frameImg.src = 'data:image/jpeg;base64,' + base64Data;
  }

  // --- Coordinates Transformation ---
  function getCanvasCoords(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;

    var x = Math.round((clientX - rect.left) * scaleX);
    var y = Math.round((clientY - rect.top) * scaleY);

    return {
      x: Math.max(0, Math.min(canvas.width, x)),
      y: Math.max(0, Math.min(canvas.height, y))
    };
  }

  // --- Viewport Event Listeners (Mouse & Touch) ---
  canvas.addEventListener('click', function (e) {
    var coords = getCanvasCoords(e.clientX, e.clientY);
    send({ type: 'click', x: coords.x, y: coords.y });
  }, false);

  canvas.addEventListener('mousedown', function (e) {
    var coords = getCanvasCoords(e.clientX, e.clientY);
    send({ type: 'mousedown', x: coords.x, y: coords.y });
  }, false);

  canvas.addEventListener('mouseup', function (e) {
    var coords = getCanvasCoords(e.clientX, e.clientY);
    send({ type: 'mouseup', x: coords.x, y: coords.y });
  }, false);

  // Wheel / Scroll event (Supports modern wheel and IE11 mousewheel)
  function handleWheel(e) {
    var deltaY = e.deltaY !== undefined ? e.deltaY : -e.wheelDelta;
    if (deltaY !== 0) {
      send({ type: 'scroll', deltaY: deltaY });
      if (e.preventDefault) e.preventDefault();
      return false;
    }
  }

  if ('onwheel' in canvas) {
    canvas.addEventListener('wheel', handleWheel, false);
  } else if ('onmousewheel' in canvas) {
    canvas.addEventListener('mousewheel', handleWheel, false);
  }

  // Touch Events for Microsoft Surface 2
  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) {
      var t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      lastTouchTime = new Date().getTime();
    }
  }, false);

  canvas.addEventListener('touchmove', function (e) {
    if (e.touches.length === 1) {
      var t = e.touches[0];
      var deltaY = touchStartY - t.clientY;

      if (Math.abs(deltaY) > 8) {
        send({ type: 'scroll', deltaY: deltaY * 2 });
        touchStartY = t.clientY;
      }
      if (e.preventDefault) e.preventDefault();
    }
  }, false);

  canvas.addEventListener('touchend', function (e) {
    var now = new Date().getTime();
    if (now - lastTouchTime < 300 && e.changedTouches.length === 1) {
      var t = e.changedTouches[0];
      var coords = getCanvasCoords(t.clientX, t.clientY);
      send({ type: 'click', x: coords.x, y: coords.y });
    }
  }, false);

  // --- Keyboard & Navigation Controls ---
  function navigateToUrl() {
    var url = urlInput.value;
    if (url) {
      send({ type: 'navigate', url: url });
      urlInput.blur();
    }
  }

  btnGo.addEventListener('click', navigateToUrl, false);

  urlInput.addEventListener('keydown', function (e) {
    if (e.keyCode === 13) {
      navigateToUrl();
    }
  }, false);

  btnBack.addEventListener('click', function () {
    send({ type: 'back' });
  }, false);

  btnForward.addEventListener('click', function () {
    send({ type: 'forward' });
  }, false);

  btnReload.addEventListener('click', function () {
    send({ type: 'reload' });
  }, false);

  qualitySelect.addEventListener('change', function () {
    var q = parseInt(qualitySelect.value, 10);
    send({ type: 'quality', quality: q });
  }, false);

  btnReconnect.addEventListener('click', function () {
    connect();
  }, false);

  // --- Virtual Keyboard Drawer (Helper for Tablet Touch) ---
  btnKeyboard.addEventListener('click', function () {
    if (keyboardDrawer.style.display === 'none') {
      keyboardDrawer.style.display = 'flex';
      typeInput.focus();
    } else {
      keyboardDrawer.style.display = 'none';
    }
  }, false);

  btnCloseKbd.addEventListener('click', function () {
    keyboardDrawer.style.display = 'none';
  }, false);

  function sendText() {
    var txt = typeInput.value;
    if (txt) {
      send({ type: 'type', text: txt });
      typeInput.value = '';
    }
  }

  btnSendText.addEventListener('click', sendText, false);

  typeInput.addEventListener('keydown', function (e) {
    if (e.keyCode === 13) {
      sendText();
      send({ type: 'keypress', key: 'Enter' });
    }
  }, false);

  btnSendEnter.addEventListener('click', function () {
    send({ type: 'keypress', key: 'Enter' });
  }, false);

  btnSendBack.addEventListener('click', function () {
    send({ type: 'keypress', key: 'Backspace' });
  }, false);

  // Auto-start connection on page load
  window.addEventListener('load', function () {
    connect();
  }, false);

})();
