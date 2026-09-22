/* ==============================================================================
   Cloud Web Browser - Client Application
   ES5 / Internet Explorer 11 compatible
   ============================================================================== */

(function () {
  'use strict';

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
  var frameImg = new Image();

  var touchStartX = 0;
  var touchStartY = 0;
  var touchLastX = 0;
  var touchLastY = 0;
  var touchStartTime = 0;
  var touchMoved = false;
  var lastMouseMoveSent = 0;
  var lastTouchEnd = 0;

  function getWebSocketUrl() {
    var loc = window.location;
    var proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + loc.host;
  }

  function setStatus(status) {
    statusBadge.className = 'status-badge status-' + status;
    statusBadge.title = status;

    if (status === 'connected') {
      overlay.style.display = 'none';
    } else if (status === 'connecting') {
      overlay.style.display = 'flex';
      overlayTitle.innerText = 'Connecting to Cloud Browser...';
      overlayMsg.innerText = 'Starting your remote Chromium session.';
      btnReconnect.style.display = 'none';
    } else {
      overlay.style.display = 'flex';
      overlayTitle.innerText = 'Connection Lost';
      overlayMsg.innerText = 'Trying to reconnect automatically. You can also reconnect now.';
      btnReconnect.style.display = 'inline-block';
    }
  }

  function connect() {
    if (ws) {
      try { ws.close(); } catch (e) {}
    }

    setStatus('connecting');

    try {
      ws = new WebSocket(getWebSocketUrl());
    } catch (err) {
      setStatus('disconnected');
      scheduleReconnect();
      return;
    }

    ws.onopen = function () {
      setStatus('connected');
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      sendClientViewport();
    };

    ws.onmessage = function (event) {
      try {
        handleServerMessage(JSON.parse(event.data));
      } catch (e) {}
    };

    ws.onclose = function () {
      setStatus('disconnected');
      scheduleReconnect();
    };

    ws.onerror = function () {};
  }

  function scheduleReconnect() {
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(function () {
        reconnectTimer = null;
        connect();
      }, 2500);
    }
  }

  function send(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(data)); } catch (e) {}
    }
  }

  function handleServerMessage(msg) {
    if (msg.type === 'frame') {
      renderFrame(msg.data);
    } else if (msg.type === 'navigated') {
      if (msg.url) urlInput.value = msg.url;
      if (msg.title) document.title = msg.title + ' - Cloud Browser';
    } else if (msg.type === 'loading') {
      loadingBar.className = msg.loading ? 'loading-bar loading-active' : 'loading-bar';
    } else if (msg.type === 'error') {
      overlay.style.display = 'flex';
      overlayTitle.innerText = 'Browser Error';
      overlayMsg.innerText = msg.message || 'Remote browser session error.';
      btnReconnect.style.display = 'inline-block';
    }
  }

  function renderFrame(base64Data) {
    frameImg.onload = function () {
      try {
        ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);
      } catch (e) {}
    };
    frameImg.src = 'data:image/jpeg;base64,' + base64Data;
  }

  function getCanvasCoords(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var width = rect.width || (rect.right - rect.left);
    var height = rect.height || (rect.bottom - rect.top);
    var scaleX = canvas.width / width;
    var scaleY = canvas.height / height;
    var x = Math.round((clientX - rect.left) * scaleX);
    var y = Math.round((clientY - rect.top) * scaleY);

    return {
      x: Math.max(0, Math.min(canvas.width - 1, x)),
      y: Math.max(0, Math.min(canvas.height - 1, y))
    };
  }

  function focusCanvas() {
    try { canvas.focus(); } catch (e) {}
  }

  function sendMouseMove(clientX, clientY, force) {
    var now = new Date().getTime();
    if (!force && now - lastMouseMoveSent < 25) return;
    lastMouseMoveSent = now;
    var c = getCanvasCoords(clientX, clientY);
    send({ type: 'mousemove', x: c.x, y: c.y });
  }

  function pointerIsTouch(e) {
    var p = e.pointerType;
    if (typeof p === 'string') return p.toLowerCase() === 'touch';
    return p === 2 || p === e.MSPOINTER_TYPE_TOUCH;
  }

  function beginTouch(clientX, clientY, e) {
    touchStartX = clientX;
    touchStartY = clientY;
    touchLastX = clientX;
    touchLastY = clientY;
    touchStartTime = new Date().getTime();
    touchMoved = false;
    if (e && e.preventDefault) e.preventDefault();
  }

  function moveTouch(clientX, clientY, e) {
    var totalX = clientX - touchStartX;
    var totalY = clientY - touchStartY;
    var deltaX = touchLastX - clientX;
    var deltaY = touchLastY - clientY;

    if (Math.abs(totalX) > 7 || Math.abs(totalY) > 7) {
      touchMoved = true;
    }

    if (touchMoved && (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1)) {
      send({
        type: 'scroll',
        deltaX: Math.round(deltaX * 2.2),
        deltaY: Math.round(deltaY * 2.2)
      });
      touchLastX = clientX;
      touchLastY = clientY;
    }

    if (e && e.preventDefault) e.preventDefault();
  }

  function endTouch(clientX, clientY, e) {
    var elapsed = new Date().getTime() - touchStartTime;
    if (!touchMoved && elapsed < 650) {
      var c = getCanvasCoords(clientX, clientY);
      send({ type: 'click', x: c.x, y: c.y });
      focusCanvas();
    }
    lastTouchEnd = new Date().getTime();
    if (e && e.preventDefault) e.preventDefault();
  }

  /* Pointer Events: IE11 / Surface preferred path */
  if (window.PointerEvent) {
    canvas.addEventListener('pointerdown', function (e) {
      if (pointerIsTouch(e)) {
        beginTouch(e.clientX, e.clientY, e);
      } else {
        var c = getCanvasCoords(e.clientX, e.clientY);
        sendMouseMove(e.clientX, e.clientY, true);
        send({ type: 'mousedown', x: c.x, y: c.y, button: e.button || 0 });
        focusCanvas();
        if (e.preventDefault) e.preventDefault();
      }
    }, false);

    canvas.addEventListener('pointermove', function (e) {
      if (pointerIsTouch(e)) {
        if (e.buttons || e.pressure > 0) moveTouch(e.clientX, e.clientY, e);
      } else {
        sendMouseMove(e.clientX, e.clientY, false);
      }
    }, false);

    canvas.addEventListener('pointerup', function (e) {
      if (pointerIsTouch(e)) {
        endTouch(e.clientX, e.clientY, e);
      } else {
        var c = getCanvasCoords(e.clientX, e.clientY);
        sendMouseMove(e.clientX, e.clientY, true);
        send({ type: 'mouseup', x: c.x, y: c.y, button: e.button || 0 });
        if (e.preventDefault) e.preventDefault();
      }
    }, false);

    canvas.addEventListener('pointercancel', function (e) {
      if (pointerIsTouch(e) && e.preventDefault) e.preventDefault();
    }, false);

  } else if (window.MSPointerEvent || navigator.msPointerEnabled) {
    canvas.addEventListener('MSPointerDown', function (e) {
      if (pointerIsTouch(e)) {
        beginTouch(e.clientX, e.clientY, e);
      } else {
        var c = getCanvasCoords(e.clientX, e.clientY);
        sendMouseMove(e.clientX, e.clientY, true);
        send({ type: 'mousedown', x: c.x, y: c.y, button: e.button || 0 });
        focusCanvas();
        if (e.preventDefault) e.preventDefault();
      }
    }, false);

    canvas.addEventListener('MSPointerMove', function (e) {
      if (pointerIsTouch(e)) moveTouch(e.clientX, e.clientY, e);
      else sendMouseMove(e.clientX, e.clientY, false);
    }, false);

    canvas.addEventListener('MSPointerUp', function (e) {
      if (pointerIsTouch(e)) {
        endTouch(e.clientX, e.clientY, e);
      } else {
        var c = getCanvasCoords(e.clientX, e.clientY);
        sendMouseMove(e.clientX, e.clientY, true);
        send({ type: 'mouseup', x: c.x, y: c.y, button: e.button || 0 });
        if (e.preventDefault) e.preventDefault();
      }
    }, false);

  } else {
    /* Mouse fallback */
    canvas.addEventListener('mousemove', function (e) {
      if (new Date().getTime() - lastTouchEnd < 700) return;
      sendMouseMove(e.clientX, e.clientY, false);
    }, false);

    canvas.addEventListener('mousedown', function (e) {
      if (new Date().getTime() - lastTouchEnd < 700) return;
      var c = getCanvasCoords(e.clientX, e.clientY);
      sendMouseMove(e.clientX, e.clientY, true);
      send({ type: 'mousedown', x: c.x, y: c.y, button: e.button || 0 });
      focusCanvas();
      if (e.preventDefault) e.preventDefault();
    }, false);

    canvas.addEventListener('mouseup', function (e) {
      if (new Date().getTime() - lastTouchEnd < 700) return;
      var c = getCanvasCoords(e.clientX, e.clientY);
      sendMouseMove(e.clientX, e.clientY, true);
      send({ type: 'mouseup', x: c.x, y: c.y, button: e.button || 0 });
      if (e.preventDefault) e.preventDefault();
    }, false);

    canvas.addEventListener('click', function (e) {
      if (new Date().getTime() - lastTouchEnd < 700) return;
      var c = getCanvasCoords(e.clientX, e.clientY);
      send({ type: 'click', x: c.x, y: c.y });
      focusCanvas();
      if (e.preventDefault) e.preventDefault();
    }, false);

    /* Touch fallback */
    canvas.addEventListener('touchstart', function (e) {
      if (e.touches && e.touches.length === 1) {
        beginTouch(e.touches[0].clientX, e.touches[0].clientY, e);
      }
    }, false);

    canvas.addEventListener('touchmove', function (e) {
      if (e.touches && e.touches.length === 1) {
        moveTouch(e.touches[0].clientX, e.touches[0].clientY, e);
      }
    }, false);

    canvas.addEventListener('touchend', function (e) {
      if (e.changedTouches && e.changedTouches.length === 1) {
        endTouch(e.changedTouches[0].clientX, e.changedTouches[0].clientY, e);
      }
    }, false);
  }

  function handleWheel(e) {
    e = e || window.event;
    var deltaY = 0;
    var deltaX = 0;

    if (typeof e.deltaY === 'number') deltaY = e.deltaY;
    else if (typeof e.wheelDelta === 'number') deltaY = -e.wheelDelta;
    else if (typeof e.detail === 'number') deltaY = e.detail * 40;

    if (typeof e.deltaX === 'number') deltaX = e.deltaX;

    if (deltaX || deltaY) {
      send({ type: 'scroll', deltaX: deltaX, deltaY: deltaY });
      if (e.preventDefault) e.preventDefault();
      e.returnValue = false;
      return false;
    }
  }

  if ('onwheel' in canvas) {
    canvas.addEventListener('wheel', handleWheel, false);
  } else {
    canvas.addEventListener('mousewheel', handleWheel, false);
    canvas.addEventListener('DOMMouseScroll', handleWheel, false);
  }

  /* Physical keyboard support after clicking remote screen */
  canvas.addEventListener('keydown', function (e) {
    e = e || window.event;
    var key = e.key || '';
    var code = e.keyCode || e.which;

    if (code === 8) key = 'Backspace';
    else if (code === 9) key = 'Tab';
    else if (code === 13) key = 'Enter';
    else if (code === 27) key = 'Escape';
    else if (code === 33) key = 'PageUp';
    else if (code === 34) key = 'PageDown';
    else if (code === 35) key = 'End';
    else if (code === 36) key = 'Home';
    else if (code === 37) key = 'ArrowLeft';
    else if (code === 38) key = 'ArrowUp';
    else if (code === 39) key = 'ArrowRight';
    else if (code === 40) key = 'ArrowDown';
    else if (code === 46) key = 'Delete';

    if (key === 'Backspace' || key === 'Tab' || key === 'Enter' || key === 'Escape' ||
        key === 'PageUp' || key === 'PageDown' || key === 'End' || key === 'Home' ||
        key === 'ArrowLeft' || key === 'ArrowUp' || key === 'ArrowRight' ||
        key === 'ArrowDown' || key === 'Delete') {
      send({ type: 'keypress', key: key });
      if (e.preventDefault) e.preventDefault();
      e.returnValue = false;
    }
  }, false);

  canvas.addEventListener('keypress', function (e) {
    e = e || window.event;
    var code = e.charCode || e.which || e.keyCode;
    if (code >= 32) {
      send({ type: 'type', text: String.fromCharCode(code) });
      if (e.preventDefault) e.preventDefault();
      e.returnValue = false;
    }
  }, false);

  function navigateToUrl() {
    var url = urlInput.value;
    if (url) {
      send({ type: 'navigate', url: url });
      try { urlInput.blur(); } catch (e) {}
    }
  }

  btnGo.addEventListener('click', navigateToUrl, false);

  urlInput.addEventListener('keydown', function (e) {
    if ((e.keyCode || e.which) === 13) {
      navigateToUrl();
      if (e.preventDefault) e.preventDefault();
      e.returnValue = false;
    }
  }, false);

  btnBack.addEventListener('click', function () { send({ type: 'back' }); }, false);
  btnForward.addEventListener('click', function () { send({ type: 'forward' }); }, false);
  btnReload.addEventListener('click', function () { send({ type: 'reload' }); }, false);

  qualitySelect.addEventListener('change', function () {
    send({ type: 'quality', quality: parseInt(qualitySelect.value, 10) || 75 });
  }, false);

  btnReconnect.addEventListener('click', connect, false);

  btnKeyboard.addEventListener('click', function () {
    if (keyboardDrawer.style.display === 'none' || !keyboardDrawer.style.display) {
      keyboardDrawer.style.display = 'flex';
      try { typeInput.focus(); } catch (e) {}
    } else {
      keyboardDrawer.style.display = 'none';
    }
  }, false);

  btnCloseKbd.addEventListener('click', function () {
    keyboardDrawer.style.display = 'none';
    focusCanvas();
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
    if ((e.keyCode || e.which) === 13) {
      sendText();
      send({ type: 'keypress', key: 'Enter' });
      if (e.preventDefault) e.preventDefault();
      e.returnValue = false;
    }
  }, false);

  btnSendEnter.addEventListener('click', function () {
    send({ type: 'keypress', key: 'Enter' });
  }, false);

  btnSendBack.addEventListener('click', function () {
    send({ type: 'keypress', key: 'Backspace' });
  }, false);

  function sendClientViewport() {
    var rect = canvas.getBoundingClientRect();
    var w = Math.round(rect.width || 1280);
    var h = Math.round(rect.height || 720);
    if (w < 800) w = 800;
    if (h < 500) h = 500;
    send({ type: 'resize', width: w, height: h });
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(sendClientViewport, 300);
  }, false);

  window.addEventListener('load', connect, false);
})();