/**
 * 圖片處理：載入、Canvas 降採樣像素化、對映色卡、統計需求。
 * 純函式（mapCellsToPattern）可在 Node 測試；瀏覽器相關函式僅在瀏覽器呼叫。
 * 掛到 window.BeadImage；Node 測試環境走 module.exports。
 */
(function (root, factory) {
  var color = (typeof module === 'object' && module.exports)
    ? require('./color-diff.js')
    : root.BeadColor;
  var api = factory(color);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BeadImage = api;
})(typeof self !== 'undefined' ? self : globalThis, function (Color) {
  'use strict';

  /** File → HTMLImageElement（object URL 用完即回收） */
  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function (e) { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  /**
   * 將圖片降採樣為 width×height 的 RGB 網格。
   * 透明底先鋪白，避免透明像素被當成黑色。
   * crop 可選：{ sx, sy, sw, sh } 指定原圖裁切區域。
   * 回傳 cells[y][x] = {r,g,b}
   */
  function pixelateImage(img, width, height, crop) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('無法建立 canvas 2D 上下文');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (crop && crop.sw > 0 && crop.sh > 0) {
      ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
    } else {
      ctx.drawImage(img, 0, 0, width, height);
    }
    var data = ctx.getImageData(0, 0, width, height).data;
    var cells = [];
    for (var y = 0; y < height; y++) {
      var row = [];
      for (var x = 0; x < width; x++) {
        var i = (y * width + x) * 4;
        row.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
      }
      cells.push(row);
    }
    return cells;
  }

  /**
   * 將 RGB 網格對映到色卡：
   * 回傳 { width, height, codes[y][x], counts{code:n}, demandList（依數量降序） }
   */
  function mapCellsToPattern(cells, card) {
    if (!cells || cells.length === 0 || !cells[0] || cells[0].length === 0) {
      throw new Error('cells 不可為空');
    }
    var height = cells.length;
    var width = cells[0].length;
    for (var y0 = 0; y0 < height; y0++) {
      if (cells[y0].length !== width) throw new Error('cells 必須是規則矩形');
    }
    var codes = [];
    var counts = {};
    for (var y = 0; y < height; y++) {
      var codeRow = [];
      for (var x = 0; x < width; x++) {
        var hit = Color.nearestColor(cells[y][x], card);
        if (!hit) throw new Error('色卡為空');
        codeRow.push(hit.code);
        counts[hit.code] = (counts[hit.code] || 0) + 1;
      }
      codes.push(codeRow);
    }
    var demandList = card
      .filter(function (c) { return counts[c.code] > 0; })
      .map(function (c) {
        return { code: c.code, hex: c.hex, rgb: c.rgb, name: c.name, demand: counts[c.code] };
      })
      .sort(function (a, b) { return b.demand - a.demand || a.code.localeCompare(b.code); });
    return { width: width, height: height, codes: codes, counts: counts, demandList: demandList };
  }

  /**
   * 內建示範圖案：32×32 愛心（紅/粉）+ 白底，供無圖片時快速體驗。
   * 直接產出 cells 後走同一條對映流程。
   */
  function makeDemoCells(size) {
    var n = 32;
    var cells = [];
    for (var y = 0; y < n; y++) {
      var row = [];
      for (var x = 0; x < n; x++) {
        // 標準愛心隱函數：(x²+y²-1)³ - x²y³ < 0
        var nx = (x - n / 2) / (n / 2) * 1.3;
        var ny = -(y - n / 2) / (n / 2) * 1.3 - 0.15;
        var v = Math.pow(nx * nx + ny * ny - 1, 3) - nx * nx * ny * ny * ny;
        if (v < 0) {
          var edge = Math.abs(nx) + Math.abs(ny);
          row.push(edge > 0.9 ? { r: 244, g: 114, b: 182 } : { r: 220, g: 38, b: 38 });
        } else {
          row.push({ r: 250, g: 250, b: 250 });
        }
      }
      cells.push(row);
    }
    return cells;
  }

  return {
    loadImageFromFile: loadImageFromFile,
    pixelateImage: pixelateImage,
    mapCellsToPattern: mapCellsToPattern,
    makeDemoCells: makeDemoCells
  };
});
