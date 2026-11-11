/**
 * 顏色工具：RGB/HEX 轉換、redmean 加權色差、最近色號搜尋。
 * 掛到 window.BeadColor；Node 測試環境走 module.exports。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BeadColor = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /** {r,g,b} → '#RRGGBB'（大寫） */
  function rgbToHex(c) {
    function h(v) {
      return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    }
    return ('#' + h(c.r) + h(c.g) + h(c.b)).toUpperCase();
  }

  /** '#RRGGBB' → {r,g,b}；非法輸入回傳 null */
  function hexToRgb(hex) {
    if (typeof hex !== 'string') return null;
    var s = hex.replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16)
    };
  }

  /**
   * redmean 加權歐氏距離：比純 RGB 歐氏更貼近人眼感知。
   * 回傳值無單位，僅供比較大小；同色為 0。
   */
  function colorDist(a, b) {
    var rmean = (a.r + b.r) / 2;
    var dr = a.r - b.r;
    var dg = a.g - b.g;
    var db = a.b - b.b;
    return Math.sqrt(
      (2 + rmean / 256) * dr * dr +
      4 * dg * dg +
      (2 + (255 - rmean) / 256) * db * db
    );
  }

  /**
   * 在色卡（[{code, rgb, ...}]）中找與 rgb 最接近的色號項目。
   * 空色卡回傳 null。
   */
  function nearestColor(rgb, card) {
    if (!card || card.length === 0) return null;
    var best = card[0];
    var bestD = colorDist(rgb, card[0].rgb);
    for (var i = 1; i < card.length; i++) {
      var d = colorDist(rgb, card[i].rgb);
      if (d < bestD) {
        bestD = d;
        best = card[i];
      }
    }
    return best;
  }

  /** 亮度（感知灰階），供文字黑白判定 */
  function luminance(rgb) {
    return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  }

  return {
    rgbToHex: rgbToHex,
    hexToRgb: hexToRgb,
    colorDist: colorDist,
    nearestColor: nearestColor,
    luminance: luminance
  };
});
