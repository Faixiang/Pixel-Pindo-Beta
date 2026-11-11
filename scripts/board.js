/**
 * 釘板（Canvas）：格網 + 凸釘 + 半透明幽靈目標色 + 已放豆。
 * 支援縮放（滾輪/滑桿）、平移（拖曳）、自動適應視窗。
 * 提供 clientX/Y ↔ 格子座標換算、吸附高亮、異色閃爍提示。
 * 掛到 window.BeadBoard。
 */
(function (root, factory) {
  root.BeadBoard = factory(root);
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
  'use strict';

  function create(canvas) {
    var BCFG = root.BeadConfig.BOARD;
    var ctx = canvas.getContext('2d');

    var width = 0;
    var height = 0;
    var baseCell = 12;      // 1× 時的格大小
    var codes = null;       // 目標色號 codes[y][x]
    var board = null;       // 已放色號 board[y][x]
    var cardMap = {};       // code → {hex, rgb}
    var showGhost = true;
    var hoverCell = null;   // {x,y}
    var wrongFlash = {};    // 'x,y' → timestamp
    var dpr = 1;

    // 框選模式（編集）
    var editMode = false;
    var selStart = null;
    var selRect = null;     // {x0,y0,x1,y1} 格子座標（含端點）
    var onSelectionChange = null;

    // 縮放與平移狀態
    var scale = 1;
    var panX = 0;
    var panY = 0;
    var autoFit = true;     // 是否處於自動適應模式
    var viewW = 0;          // 容器可用寬
    var viewH = 0;          // 容器可用高

    function setPalette(card) {
      cardMap = {};
      card.forEach(function (c) { cardMap[c.code] = c; });
    }

    function setPattern(patternCodes, placedBoard) {
      codes = patternCodes;
      board = placedBoardRef || null;
      height = codes.length;
      width = codes[0].length;
      hoverCell = null;
      wrongFlash = {};
      resetFit();
    }

    var placedBoardRef = null;
    function bindBoard(boardRef) {
      placedBoardRef = boardRef;
      board = boardRef;
      render();
    }

    /** 計算 1× 時的基礎格大小 */
    function calcBaseCell() {
      if (!width || !height) return 12;
      return Math.max(BCFG.CELL_MIN, Math.min(BCFG.CELL_MAX,
        Math.floor(BCFG.MAX_DISPLAY / Math.max(width, height))));
    }

    /** 計算自動適應的倍率 */
    function calcFitScale() {
      if (!width || !height || !viewW || !viewH) return 1;
      var fitX = viewW / (width * baseCell);
      var fitY = viewH / (height * baseCell);
      return Math.max(BCFG.ZOOM_MIN, Math.min(BCFG.ZOOM_MAX, Math.min(fitX, fitY)));
    }

    /** 限制 pan 使圖案不會完全移出視野 */
    function clampPan() {
      var bw = width * baseCell * scale;
      var bh = height * baseCell * scale;
      var maxPX = Math.max(0, bw - viewW) / 2 + bw * 0.1;
      var maxPY = Math.max(0, bh - viewH) / 2 + bh * 0.1;
      panX = Math.max(-maxPX, Math.min(maxPX, panX));
      panY = Math.max(-maxPY, Math.min(maxPY, panY));
    }

    /** 設定 canvas 物理尺寸（固定為容器大小 × dpr） */
    function resize() {
      if (!canvas.parentElement) return;
      var rect = canvas.parentElement.getBoundingClientRect();
      viewW = Math.max(1, rect.width);
      viewH = Math.max(1, rect.height);
      dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      canvas.width = viewW * dpr;
      canvas.height = viewH * dpr;
      canvas.style.width = viewW + 'px';
      canvas.style.height = viewH + 'px';
      if (autoFit && width) {
        scale = calcFitScale();
        panX = 0;
        panY = 0;
      } else {
        clampPan();
      }
      render();
    }

    /** 回到自動適應 */
    function resetFit() {
      autoFit = true;
      baseCell = calcBaseCell();
      scale = calcFitScale();
      panX = 0;
      panY = 0;
      render();
    }

    /** 手動設定倍率（以視口中心為錨點） */
    function setZoom(newScale) {
      newScale = Math.max(BCFG.ZOOM_MIN, Math.min(BCFG.ZOOM_MAX, newScale));
      if (Math.abs(newScale - scale) < 0.001) return;
      // 保持視口中心的世界座標不變
      var cx = (viewW / 2 - panX) / scale;
      var cy = (viewH / 2 - panY) / scale;
      scale = newScale;
      panX = viewW / 2 - cx * scale;
      panY = viewH / 2 - cy * scale;
      autoFit = false;
      clampPan();
      render();
    }

    /** 以指定螢幕座標為錨點縮放 */
    function zoomAt(screenX, screenY, factor) {
      var rect = canvas.getBoundingClientRect();
      var lx = screenX - rect.left;
      var ly = screenY - rect.top;
      // 該點在世界座標中的位置
      var wx = (lx - panX) / scale;
      var wy = (ly - panY) / scale;
      var newScale = Math.max(BCFG.ZOOM_MIN, Math.min(BCFG.ZOOM_MAX, scale * factor));
      panX = lx - wx * newScale;
      panY = ly - wy * newScale;
      scale = newScale;
      autoFit = false;
      clampPan();
      render();
    }

    function shade(hex, amt) {
      var c = root.BeadColor.hexToRgb(hex) || { r: 128, g: 128, b: 128 };
      function f(v) { return Math.max(0, Math.min(255, Math.round(v + amt))); }
      return 'rgb(' + f(c.r) + ',' + f(c.g) + ',' + f(c.b) + ')';
    }

    function render() {
      if (!codes) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewW, viewH);

      // 套用 pan + scale 變換
      ctx.save();
      ctx.translate(viewW / 2 + panX, viewH / 2 + panY);
      ctx.scale(scale, scale);
      // 將原點移到圖案左上角
      var bw = width * baseCell;
      var bh = height * baseCell;
      ctx.translate(-bw / 2, -bh / 2);

      var now = Date.now();
      Object.keys(wrongFlash).forEach(function (k) {
        if (now - wrongFlash[k] > 900) delete wrongFlash[k];
      });

      var x, y;
      // 幽靈目標色
      if (showGhost) {
        for (y = 0; y < height; y++) {
          for (x = 0; x < width; x++) {
            var c = cardMap[codes[y][x]];
            if (!c) continue;
            ctx.globalAlpha = BCFG.GHOST_ALPHA;
            ctx.fillStyle = c.hex;
            ctx.fillRect(x * baseCell, y * baseCell, baseCell, baseCell);
          }
        }
        ctx.globalAlpha = 1;
      }

      // 格線
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      for (x = 0; x <= width; x++) {
        ctx.moveTo(x * baseCell + 0.5 / scale, 0);
        ctx.lineTo(x * baseCell + 0.5 / scale, bh);
      }
      for (y = 0; y <= height; y++) {
        ctx.moveTo(0, y * baseCell + 0.5 / scale);
        ctx.lineTo(bw, y * baseCell + 0.5 / scale);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1.4 / scale;
      ctx.beginPath();
      for (x = 0; x <= width; x += 5) {
        ctx.moveTo(x * baseCell, 0);
        ctx.lineTo(x * baseCell, bh);
      }
      for (y = 0; y <= height; y += 5) {
        ctx.moveTo(0, y * baseCell);
        ctx.lineTo(bw, y * baseCell);
      }
      ctx.stroke();

      // 凸釘
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (y = 0; y < height; y++) {
        for (x = 0; x < width; x++) {
          if (board && board[y][x] === null) {
            ctx.beginPath();
            ctx.arc(x * baseCell + baseCell / 2, y * baseCell + baseCell / 2,
              Math.max(0.5, baseCell * 0.07), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // 已放豆
      if (board) {
        for (y = 0; y < height; y++) {
          for (x = 0; x < width; x++) {
            var code = board[y][x];
            if (code === null) continue;
            var cc = cardMap[code];
            var hex = cc ? cc.hex : '#FF00FF';
            var cx = x * baseCell + baseCell / 2;
            var cy = y * baseCell + baseCell / 2;
            var r = baseCell * 0.44;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = hex;
            ctx.fill();
            ctx.strokeStyle = shade(hex, -50);
            ctx.lineWidth = 1 / scale;
            ctx.stroke();
            if (baseCell >= 8) {
              ctx.beginPath();
              ctx.arc(cx - r * 0.3, cy - r * 0.34, r * 0.26, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(255,255,255,0.4)';
              ctx.fill();
              ctx.beginPath();
              ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2);
              ctx.fillStyle = shade(hex, -38);
              ctx.fill();
            }
            if (code !== codes[y][x]) {
              ctx.beginPath();
              ctx.arc(cx, cy, r + 0.5, 0, Math.PI * 2);
              ctx.strokeStyle = 'rgba(248,113,113,0.9)';
              ctx.lineWidth = 1.5 / scale;
              ctx.stroke();
            }
          }
        }
      }

      // 異色閃爍
      Object.keys(wrongFlash).forEach(function (k) {
        var parts = k.split(',');
        var fx = +parts[0];
        var fy = +parts[1];
        var t = (now - wrongFlash[k]) / 900;
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = '#FACC15';
        ctx.lineWidth = 2.5 / scale;
        ctx.strokeRect(fx * baseCell + 1, fy * baseCell + 1, baseCell - 2, baseCell - 2);
        ctx.globalAlpha = 1;
      });

      // 吸附預覽高亮
      if (hoverCell) {
        ctx.strokeStyle = '#22D3EE';
        ctx.lineWidth = 2 / scale;
        ctx.strokeRect(hoverCell.x * baseCell + 1, hoverCell.y * baseCell + 1, baseCell - 2, baseCell - 2);
        ctx.fillStyle = 'rgba(34,211,238,0.15)';
        ctx.fillRect(hoverCell.x * baseCell, hoverCell.y * baseCell, baseCell, baseCell);
      }

      // 框選區域（編集模式）：遮罩框外 + 高亮框內
      if (editMode && selRect) {
        var sx0 = Math.min(selRect.x0, selRect.x1);
        var sy0 = Math.min(selRect.y0, selRect.y1);
        var sx1 = Math.max(selRect.x0, selRect.x1) + 1;
        var sy1 = Math.max(selRect.y0, selRect.y1) + 1;
        var cx0 = sx0 * baseCell, cy0 = sy0 * baseCell;
        var cw = (sx1 - sx0) * baseCell, ch2 = (sy1 - sy0) * baseCell;
        // 框外遮罩
        ctx.save();
        ctx.fillStyle = 'rgba(4,5,14,0.62)';
        ctx.beginPath();
        ctx.rect(0, 0, bw, bh);
        ctx.rect(cx0, cy0, cw, ch2);
        ctx.fill('evenodd');
        ctx.restore();
        // 框線
        ctx.strokeStyle = '#22D3EE';
        ctx.lineWidth = 2 / scale;
        ctx.strokeRect(cx0, cy0, cw, ch2);
        // 四角把手
        var hs = 10 / scale;
        ctx.fillStyle = '#22D3EE';
        [[cx0, cy0], [cx0 + cw - hs, cy0], [cx0, cy0 + ch2 - hs], [cx0 + cw - hs, cy0 + ch2 - hs]]
          .forEach(function (p) { ctx.fillRect(p[0], p[1], hs, hs); });
      }

      ctx.restore();
    }

    /** 從 client 座標取格子（不限制在範圍內，供框選用） */
    function cellFromClientClamped(clientX, clientY) {
      var c = cellFromClient(clientX, clientY);
      if (c) return c;
      var rect = canvas.getBoundingClientRect();
      var lx = clientX - rect.left;
      var ly = clientY - rect.top;
      var bw = width * baseCell;
      var bh = height * baseCell;
      var wx = (lx - viewW / 2 - panX) / scale + bw / 2;
      var wy = (ly - viewH / 2 - panY) / scale + bh / 2;
      var gx = Math.floor(wx / baseCell);
      var gy = Math.floor(wy / baseCell);
      return {
        x: Math.max(0, Math.min(width - 1, gx)),
        y: Math.max(0, Math.min(height - 1, gy))
      };
    }

    /** 開啟/關閉框選模式 */
    function setEditMode(on) {
      editMode = !!on;
      if (!editMode) selRect = null;
      selStart = null;
      render();
      if (onSelectionChange) onSelectionChange(selRect);
    }

    function isEditMode() { return editMode; }

    function getSelection() {
      if (!selRect) return null;
      var x0 = Math.min(selRect.x0, selRect.x1);
      var y0 = Math.min(selRect.y0, selRect.y1);
      var x1 = Math.max(selRect.x0, selRect.x1);
      var y1 = Math.max(selRect.y0, selRect.y1);
      return { x0: x0, y0: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }

    function setSelectionChangeHandler(fn) { onSelectionChange = fn; }

    /** 直接設定選取範圍（格子座標，含端點） */
    function setSelectionRect(x0, y0, x1, y1) {
      selRect = {
        x0: Math.max(0, Math.min(width - 1, x0)),
        y0: Math.max(0, Math.min(height - 1, y0)),
        x1: Math.max(0, Math.min(width - 1, x1)),
        y1: Math.max(0, Math.min(height - 1, y1))
      };
      render();
      if (onSelectionChange) onSelectionChange(getSelection());
    }

    /** clientX/Y → 格子 {x,y}；考慮 pan/scale/CSS 縮放 */
    function cellFromClient(clientX, clientY) {
      var rect = canvas.getBoundingClientRect();
      // CSS 像素座標（相對於 canvas 左上角）
      var lx = clientX - rect.left;
      var ly = clientY - rect.top;
      // 反向套用 transform：先 translate(viewW/2+panX, viewH/2+panY)，再 scale，再 translate(-bw/2,-bh/2)
      var bw = width * baseCell;
      var bh = height * baseCell;
      var wx = (lx - viewW / 2 - panX) / scale + bw / 2;
      var wy = (ly - viewH / 2 - panY) / scale + bh / 2;
      var gx = Math.floor(wx / baseCell);
      var gy = Math.floor(wy / baseCell);
      if (gx < 0 || gy < 0 || gx >= width || gy >= height) return null;
      return { x: gx, y: gy };
    }

    function setHover(cellPos) {
      hoverCell = cellPos;
      render();
    }

    function flashWrong(x0, y0) {
      wrongFlash[x0 + ',' + y0] = Date.now();
      render();
      requestAnimationFrame(function anim() {
        if (wrongFlash[x0 + ',' + y0]) {
          render();
          requestAnimationFrame(anim);
        }
      });
    }

    // 框選拖曳（編集模式下）
    canvas.addEventListener('pointerdown', function (e) {
      if (!editMode || !codes) return;
      var c = cellFromClientClamped(e.clientX, e.clientY);
      selStart = c;
      selRect = { x0: c.x, y0: c.y, x1: c.x, y1: c.y };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      render();
      if (onSelectionChange) onSelectionChange(getSelection());
      e.preventDefault();
      e.stopPropagation();
    }, true);

    canvas.addEventListener('pointermove', function (e) {
      if (!editMode || !selStart) return;
      var c = cellFromClientClamped(e.clientX, e.clientY);
      selRect = { x0: selStart.x, y0: selStart.y, x1: c.x, y1: c.y };
      render();
      if (onSelectionChange) onSelectionChange(getSelection());
      e.preventDefault();
      e.stopPropagation();
    }, true);

    function endSelection(e) {
      if (!editMode || !selStart) return;
      selStart = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
      if (onSelectionChange) onSelectionChange(getSelection());
    }
    canvas.addEventListener('pointerup', endSelection, true);
    canvas.addEventListener('pointercancel', endSelection, true);

    // ResizeObserver 即時響應容器大小變化
    var ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(function () { resize(); });
      ro.observe(canvas.parentElement);
    }
    window.addEventListener('resize', function () { resize(); });

    return {
      canvas: canvas,
      setPalette: setPalette,
      setPattern: setPattern,
      bindBoard: bindBoard,
      setGhost: function (on) { showGhost = on; render(); },
      getGhost: function () { return showGhost; },
      render: render,
      cellFromClient: cellFromClient,
      setHover: setHover,
      flashWrong: flashWrong,
      setEditMode: setEditMode,
      isEditMode: isEditMode,
      getSelection: getSelection,
      setSelectionChangeHandler: setSelectionChangeHandler,
      setSelectionRect: setSelectionRect,
      cellFromClientClamped: cellFromClientClamped,
      getSize: function () { return { width: width, height: height, baseCell: baseCell }; },
      // 縮放/平移 API
      setZoom: setZoom,
      zoomAt: zoomAt,
      resetFit: resetFit,
      getScale: function () { return scale; },
      isAutoFit: function () { return autoFit; },
      getPan: function () { return { x: panX, y: panY }; },
      setPan: function (x, y) { panX = x; panY = y; autoFit = false; clampPan(); render(); },
      resize: resize,
      getViewSize: function () { return { w: viewW, h: viewH }; }
    };
  }

  return { create: create };
});
