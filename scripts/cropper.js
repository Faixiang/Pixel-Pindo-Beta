/**
 * 圖片裁切挑選器：拖曳框選要轉成拼豆的區域。
 * - 鎖定目標網格長寬比（避免像素化變形）
 * - 可拖動框、拖四角/四邊縮放
 * - 即時預覽框內像素化結果
 * 掛到 window.BeadCropper。
 */
(function (root) {
  'use strict';

  function create(opts) {
    var modal = opts.modal;
    var canvas = opts.canvas;
    var ctx = canvas.getContext('2d');
    var previewCanvas = opts.previewCanvas;
    var pctx = previewCanvas.getContext('2d');
    var infoEl = opts.infoEl;
    var onConfirm = opts.onConfirm || function () {};
    var onSkip = opts.onSkip || function () {};

    var img = null;
    var ratio = 1;          // 目標長寬比 (w/h)
    var viewW = 0, viewH = 0;   // canvas 顯示尺寸（CSS px）
    var imgRect = { x: 0, y: 0, w: 0, h: 0 };  // 圖片在 canvas 內的顯示區域
    var crop = { x: 0, y: 0, w: 0, h: 0 };     // 裁切框（canvas 座標）
    var dragMode = null;    // 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e'
    var dragStart = null;
    var HANDLE = 14;

    function open(image, gridW, gridH) {
      img = image;
      ratio = gridW / gridH;
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
      layout();
      resetCrop();
      render();
      renderPreview();
      updateInfo();
    }

    function close() {
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
      img = null;
    }

    /** 依圖片與視窗大小計算 canvas 顯示尺寸 */
    function layout() {
      if (!img) return;
      var maxW = Math.min(window.innerWidth * 0.82, 860);
      var maxH = Math.min(window.innerHeight * 0.62, 560);
      var scale = Math.min(maxW / img.width, maxH / img.height, 1);
      viewW = Math.round(img.width * scale);
      viewH = Math.round(img.height * scale);
      var dpr = window.devicePixelRatio || 1;
      canvas.width = viewW * dpr;
      canvas.height = viewH * dpr;
      canvas.style.width = viewW + 'px';
      canvas.style.height = viewH + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      imgRect = { x: 0, y: 0, w: viewW, h: viewH };
    }

    /** 依比例計算預設裁切框（最大內接矩形） */
    function resetCrop() {
      var w = imgRect.w;
      var h = imgRect.h;
      var cw, ch;
      if (w / h > ratio) {
        // 圖較寬 → 以高為準
        ch = h;
        cw = ch * ratio;
      } else {
        cw = w;
        ch = cw / ratio;
      }
      crop = {
        x: imgRect.x + (w - cw) / 2,
        y: imgRect.y + (h - ch) / 2,
        w: cw,
        h: ch
      };
    }

    function clampCrop() {
      var minSize = 24;
      crop.w = Math.max(minSize, Math.min(imgRect.w, crop.w));
      crop.h = crop.w / ratio;
      if (crop.h > imgRect.h) {
        crop.h = imgRect.h;
        crop.w = crop.h * ratio;
      }
      crop.x = Math.max(imgRect.x, Math.min(imgRect.x + imgRect.w - crop.w, crop.x));
      crop.y = Math.max(imgRect.y, Math.min(imgRect.y + imgRect.h - crop.h, crop.y));
    }

    function render() {
      ctx.clearRect(0, 0, viewW, viewH);
      if (!img) return;
      ctx.drawImage(img, imgRect.x, imgRect.y, imgRect.w, imgRect.h);

      // 遮罩（框外變暗）
      ctx.save();
      ctx.fillStyle = 'rgba(4, 5, 14, 0.62)';
      ctx.beginPath();
      ctx.rect(0, 0, viewW, viewH);
      ctx.rect(crop.x, crop.y, crop.w, crop.h);
      ctx.fill('evenodd');
      ctx.restore();

      // 框線
      ctx.strokeStyle = '#22D3EE';
      ctx.lineWidth = 2;
      ctx.strokeRect(crop.x + 1, crop.y + 1, crop.w - 2, crop.h - 2);

      // 三分線
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var i = 1; i <= 2; i++) {
        var gx = crop.x + (crop.w * i) / 3;
        var gy = crop.y + (crop.h * i) / 3;
        ctx.moveTo(gx, crop.y);
        ctx.lineTo(gx, crop.y + crop.h);
        ctx.moveTo(crop.x, gy);
        ctx.lineTo(crop.x + crop.w, gy);
      }
      ctx.stroke();

      // 四角把手
      ctx.fillStyle = '#22D3EE';
      var hs = 10;
      var corners = [
        [crop.x, crop.y], [crop.x + crop.w - hs, crop.y],
        [crop.x, crop.y + crop.h - hs], [crop.x + crop.w - hs, crop.y + crop.h - hs]
      ];
      corners.forEach(function (p) {
        ctx.fillRect(p[0], p[1], hs, hs);
      });
    }

    /** 框內像素化預覽 */
    function renderPreview() {
      if (!img || !previewCanvas) return;
      var gw = opts.getGridW ? opts.getGridW() : 40;
      var gh = opts.getGridH ? opts.getGridH() : 40;
      var size = 132;
      previewCanvas.width = size;
      previewCanvas.height = size;
      pctx.imageSmoothingEnabled = false;
      pctx.clearRect(0, 0, size, size);

      // 換算原圖座標
      var sx = (crop.x - imgRect.x) / imgRect.w * img.width;
      var sy = (crop.y - imgRect.y) / imgRect.h * img.height;
      var sw = crop.w / imgRect.w * img.width;
      var sh = crop.h / imgRect.h * img.height;

      // 先降到網格尺寸再放大顯示（模擬像素化）
      var tmp = document.createElement('canvas');
      tmp.width = gw;
      tmp.height = gh;
      var tctx = tmp.getContext('2d');
      tctx.fillStyle = '#FFFFFF';
      tctx.fillRect(0, 0, gw, gh);
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = 'high';
      tctx.drawImage(img, sx, sy, sw, sh, 0, 0, gw, gh);

      pctx.drawImage(tmp, 0, 0, gw, gh, 0, 0, size, size);
    }

    function updateInfo() {
      if (!infoEl || !img) return;
      var sx = (crop.x - imgRect.x) / imgRect.w * img.width;
      var sy = (crop.y - imgRect.y) / imgRect.h * img.height;
      var sw = crop.w / imgRect.w * img.width;
      var sh = crop.h / imgRect.h * img.height;
      var gw = opts.getGridW ? opts.getGridW() : 40;
      var gh = opts.getGridH ? opts.getGridH() : 40;
      infoEl.textContent = '裁切區域 ' + Math.round(sw) + '×' + Math.round(sh) +
        ' px → ' + gw + '×' + gh + ' 格（比例 ' + gw + ':' + gh + '）';
    }

    /** 判斷點擊位置落在哪個把手 / 框內 / 框外 */
    function hitTest(px, py) {
      var near = function (v, t) { return Math.abs(v - t) <= HANDLE; };
      var atL = near(px, crop.x);
      var atR = near(px, crop.x + crop.w);
      var atT = near(py, crop.y);
      var atB = near(py, crop.y + crop.h);
      if (atL && atT) return 'nw';
      if (atR && atT) return 'ne';
      if (atL && atB) return 'sw';
      if (atR && atB) return 'se';
      if (atL) return 'w';
      if (atR) return 'e';
      if (atT) return 'n';
      if (atB) return 's';
      if (px > crop.x && px < crop.x + crop.w && py > crop.y && py < crop.y + crop.h) return 'move';
      return null;
    }

    function localPoint(e) {
      var r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) / r.width * viewW,
        y: (e.clientY - r.top) / r.height * viewH
      };
    }

    canvas.addEventListener('pointerdown', function (e) {
      if (!img) return;
      var p = localPoint(e);
      var mode = hitTest(p.x, p.y);
      if (!mode) return;
      dragMode = mode;
      dragStart = { x: p.x, y: p.y, crop: { x: crop.x, y: crop.y, w: crop.w, h: crop.h } };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!img) return;
      var p = localPoint(e);
      if (!dragMode) {
        var mode = hitTest(p.x, p.y);
        canvas.style.cursor = mode === 'move' ? 'grab'
          : (mode === 'nw' || mode === 'se') ? 'nwse-resize'
          : (mode === 'ne' || mode === 'sw') ? 'nesw-resize'
          : (mode === 'n' || mode === 's') ? 'ns-resize'
          : (mode === 'e' || mode === 'w') ? 'ew-resize'
          : 'default';
        return;
      }
      var dx = p.x - dragStart.x;
      var dy = p.y - dragStart.y;
      var c0 = dragStart.crop;

      if (dragMode === 'move') {
        crop.x = c0.x + dx;
        crop.y = c0.y + dy;
      } else {
        // 依對角/邊方向縮放，維持比例
        var anchorX = c0.x, anchorY = c0.y;
        var newW = c0.w, newH = c0.h;
        if (dragMode.indexOf('e') >= 0) {
          newW = c0.w + dx;
          anchorX = c0.x;
        } else if (dragMode.indexOf('w') >= 0) {
          newW = c0.w - dx;
          anchorX = c0.x + c0.w;
        }
        if (dragMode.indexOf('s') >= 0) {
          newH = c0.h + dy;
          anchorY = c0.y;
        } else if (dragMode.indexOf('n') >= 0) {
          newH = c0.h - dy;
          anchorY = c0.y + c0.h;
        }
        // 以寬為主維持比例
        var w2 = Math.max(24, Math.max(newW, newH * ratio));
        var h2 = w2 / ratio;
        if (dragMode.indexOf('w') >= 0) crop.x = anchorX - w2;
        else crop.x = anchorX;
        if (dragMode.indexOf('n') >= 0) crop.y = anchorY - h2;
        else crop.y = anchorY;
        crop.w = w2;
        crop.h = h2;
      }
      clampCrop();
      render();
      renderPreview();
      updateInfo();
    });

    function endDrag(e) {
      if (!dragMode) return;
      dragMode = null;
      dragStart = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    /** 取得換算後的原圖裁切參數（供 pixelate 使用） */
    function getCropRect() {
      if (!img) return null;
      return {
        sx: (crop.x - imgRect.x) / imgRect.w * img.width,
        sy: (crop.y - imgRect.y) / imgRect.h * img.height,
        sw: crop.w / imgRect.w * img.width,
        sh: crop.h / imgRect.h * img.height
      };
    }

    // 按鈕
    opts.confirmBtn.addEventListener('click', function () {
      var rect = getCropRect();
      close();
      onConfirm(rect);
    });
    opts.resetBtn.addEventListener('click', function () {
      resetCrop();
      render();
      renderPreview();
      updateInfo();
    });
    opts.skipBtn.addEventListener('click', function () {
      close();
      onSkip();
    });
    opts.cancelBtn.addEventListener('click', close);

    window.addEventListener('resize', function () {
      if (!modal.classList.contains('show')) return;
      layout();
      clampCrop();
      render();
      renderPreview();
      updateInfo();
    });

    return {
      open: open,
      close: close,
      refresh: function () {
        if (!modal.classList.contains('show') || !img) return;
        var gw = opts.getGridW ? opts.getGridW() : 40;
        var gh = opts.getGridH ? opts.getGridH() : 40;
        var newRatio = gw / gh;
        if (Math.abs(newRatio - ratio) > 0.0001) {
          // 網格比例變了 → 重算裁切框
          ratio = newRatio;
          resetCrop();
          render();
        }
        renderPreview();
        updateInfo();
      },
      isOpen: function () { return modal.classList.contains('show'); }
    };
  }

  root.BeadCropper = { create: create };
})(typeof self !== 'undefined' ? self : globalThis);
