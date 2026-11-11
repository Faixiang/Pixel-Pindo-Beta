/**
 * 背景系統：宇宙光暈 + Canvas 網格動畫 + 深/淺主題切換。
 * 移植自 U:\拼豆工具\01_网页应用\拼豆工具.html。
 * 掛到 window.BeadBackground。
 */
(function (root) {
  'use strict';

  var GRID_CELL = 80;
  var GRID_SPEED = 0.9;
  var bgCanvas = null;
  var bgCtx = null;
  var gridOffset = 0;
  var gridSeed = Math.random() * 1000;
  var gridLast = 0;
  var gridLineColor = 'rgba(255,255,255,0.06)';
  var gridCellAlpha = 0.28;
  var gridLabelDark = false;
  var themeMode = 'dark';
  var seedTimer = null;
  var rafId = null;

  function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    var k = function (n) { return (n + h / 30) % 12; };
    var a = s * Math.min(l, 1 - l);
    var f = function (n) {
      return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    };
    return {
      r: Math.round(255 * f(0)),
      g: Math.round(255 * f(8)),
      b: Math.round(255 * f(4))
    };
  }

  function cellHash(cx, cy, seed) {
    var h = ((cx * 73856093) >>> 0) ^ ((cy * 19349663) >>> 0) ^ ((seed * 2654435761) >>> 0);
    h = (((h ^ (h >>> 13)) * 1274126177) >>> 0);
    h = ((h ^ (h >>> 16)) >>> 0);
    return h;
  }

  function sizeGrid() {
    if (!bgCanvas) return;
    var dpr = window.devicePixelRatio || 1;
    var W = window.innerWidth;
    var H = window.innerHeight;
    bgCanvas.width = W * dpr;
    bgCanvas.height = H * dpr;
    bgCanvas.style.width = W + 'px';
    bgCanvas.style.height = H + 'px';
    bgCtx = bgCanvas.getContext('2d');
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function paintGrid(offset) {
    if (!bgCtx) return;
    var cell = GRID_CELL;
    var W = window.innerWidth;
    var H = window.innerHeight;
    bgCtx.clearRect(0, 0, W, H);

    // 網格線
    bgCtx.strokeStyle = gridLineColor;
    bgCtx.lineWidth = 1;
    bgCtx.beginPath();
    var xS = Math.floor((-cell - offset) / cell);
    var xE = Math.ceil((W + cell - offset) / cell);
    for (var k = xS; k <= xE; k++) {
      var sx = k * cell + offset;
      bgCtx.moveTo(sx + 0.5, -cell);
      bgCtx.lineTo(sx + 0.5, H + cell);
    }
    var yS = Math.floor((-cell + offset) / cell);
    var yE = Math.ceil((H + cell + offset) / cell);
    for (var k2 = yS; k2 <= yE; k2++) {
      var sy = k2 * cell - offset;
      bgCtx.moveTo(-cell, sy + 0.5);
      bgCtx.lineTo(W + cell, sy + 0.5);
    }
    bgCtx.stroke();

    // 20% 隨機色格 + HEX
    var cxS = Math.floor((-cell - offset) / cell);
    var cxE = Math.ceil((W + cell - offset) / cell);
    var cyS = Math.floor((-cell + offset) / cell);
    var cyE = Math.ceil((H + cell + offset) / cell);
    for (var cy = cyS; cy <= cyE; cy++) {
      for (var cx = cxS; cx <= cxE; cx++) {
        if (cellHash(cx, cy, gridSeed) % 5 !== 0) continue;
        var sx2 = cx * cell + offset;
        var sy2 = cy * cell - offset;
        var hue = cellHash(cx, cy, gridSeed + 1) % 360;
        var rgb = hslToRgb(hue, 72, 62);
        bgCtx.fillStyle = 'hsla(' + hue + ',72%,62%,' + gridCellAlpha + ')';
        bgCtx.fillRect(sx2 + 1, sy2 + 1, cell - 2, cell - 2);
        var labelCol;
        if (gridLabelDark) {
          labelCol = 'rgba(20,22,40,0.80)';
        } else {
          var lum = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
          labelCol = lum > 140 ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.92)';
        }
        bgCtx.fillStyle = labelCol;
        bgCtx.font = '10px ui-monospace, monospace';
        bgCtx.textAlign = 'center';
        bgCtx.textBaseline = 'middle';
        bgCtx.fillText(root.BeadColor.rgbToHex(rgb), sx2 + cell / 2, sy2 + cell / 2);
      }
    }
  }

  function animateGrid(t) {
    if (!bgCtx) {
      rafId = requestAnimationFrame(animateGrid);
      return;
    }
    if (t - gridLast >= 33) {
      gridLast = t;
      gridOffset += GRID_SPEED;
      paintGrid(gridOffset);
    }
    rafId = requestAnimationFrame(animateGrid);
  }

  function applyTheme(mode) {
    themeMode = mode;
    var rootEl = document.documentElement;
    if (mode === 'light') {
      rootEl.setAttribute('data-theme', 'light');
      gridLineColor = 'rgba(0,0,0,0.06)';
      gridCellAlpha = 0.42;
      gridLabelDark = true;
    } else {
      rootEl.removeAttribute('data-theme');
      gridLineColor = 'rgba(255,255,255,0.06)';
      gridCellAlpha = 0.28;
      gridLabelDark = false;
    }
    try { localStorage.setItem('bead-theme', mode); } catch (e) {}
    var icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = mode === 'light' ? '☀️' : '🌙';
  }

  function init() {
    bgCanvas = document.getElementById('bgGrid');
    if (!bgCanvas) return;
    sizeGrid();
    window.addEventListener('resize', sizeGrid);
    seedTimer = setInterval(function () { gridSeed = Math.random() * 1000; }, 5000);
    var saved = 'dark';
    try { saved = localStorage.getItem('bead-theme') || 'dark'; } catch (e) {}
    applyTheme(saved);
    rafId = requestAnimationFrame(animateGrid);
  }

  root.BeadBackground = {
    init: init,
    applyTheme: applyTheme,
    toggle: function () { applyTheme(themeMode === 'dark' ? 'light' : 'dark'); },
    getTheme: function () { return themeMode; }
  };
})(typeof self !== 'undefined' ? self : globalThis);
