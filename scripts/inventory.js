/**
 * 進度統計（僅需求統計模式：豆子無限供應）。
 * - demand：各色需求（來自目標圖案）
 * - placed：各色實際放上釘板數（含放錯格）
 * - correct：各色放對格數
 * - remaining = max(demand - correct, 0)
 * - 完成度 = correctTotal / demandTotal
 * 掛到 window.BeadInventory；Node 測試環境走 module.exports。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BeadInventory = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  function create(codes) {
    if (!codes || codes.length === 0 || !codes[0] || codes[0].length === 0) {
      throw new Error('codes 不可為空');
    }
    var height = codes.length;
    var width = codes[0].length;
    for (var y0 = 0; y0 < height; y0++) {
      if (codes[y0].length !== width) throw new Error('codes 必須是規則矩形');
    }

    var demand = {};
    var placedByCode = {};
    var correctByCode = {};
    var placedTotal = 0;
    var correctTotal = 0;
    var demandTotal = width * height;
    // board[y][x] = 色號 or null
    var board = [];
    var y, x;
    for (y = 0; y < height; y++) {
      var row = [];
      for (x = 0; x < width; x++) {
        row.push(null);
        var code = codes[y][x];
        demand[code] = (demand[code] || 0) + 1;
      }
      board.push(row);
    }

    function inBounds(x0, y0) {
      return x0 >= 0 && y0 >= 0 && x0 < width && y0 < height;
    }

    return {
      width: width,
      height: height,
      codes: codes,
      board: board,

      targetAt: function (x0, y0) {
        return inBounds(x0, y0) ? codes[y0][x0] : null;
      },

      beadAt: function (x0, y0) {
        return inBounds(x0, y0) ? board[y0][x0] : null;
      },

      /** 空格才可放；成功回傳 { correct:boolean }，失敗回傳 null */
      place: function (x0, y0, code) {
        if (!inBounds(x0, y0) || typeof code !== 'string' || code === '') return null;
        if (board[y0][x0] !== null) return null;
        board[y0][x0] = code;
        placedByCode[code] = (placedByCode[code] || 0) + 1;
        placedTotal++;
        var correct = codes[y0][x0] === code;
        if (correct) {
          correctByCode[code] = (correctByCode[code] || 0) + 1;
          correctTotal++;
        }
        return { correct: correct };
      },

      /** 取回豆子；成功回傳色號，空格/越界回傳 null */
      remove: function (x0, y0) {
        if (!inBounds(x0, y0)) return null;
        var code = board[y0][x0];
        if (code === null) return null;
        board[y0][x0] = null;
        placedByCode[code]--;
        placedTotal--;
        if (codes[y0][x0] === code) {
          correctByCode[code]--;
          correctTotal--;
        }
        return code;
      },

      /** 單色統計 */
      colorStats: function (code) {
        var d = demand[code] || 0;
        var p = placedByCode[code] || 0;
        var c = correctByCode[code] || 0;
        return { code: code, demand: d, placed: p, correct: c, remaining: Math.max(d - c, 0) };
      },

      /** 全色統計（含需求為 0 但有放置的色號） */
      allStats: function () {
        var set = {};
        Object.keys(demand).forEach(function (k) { set[k] = true; });
        Object.keys(placedByCode).forEach(function (k) {
          if (placedByCode[k] > 0) set[k] = true;
        });
        var self = this;
        return Object.keys(set).sort().map(function (k) { return self.colorStats(k); });
      },

      /** 總計：demandTotal / placedTotal / correctTotal / wrongTotal / remaining / percent */
      totals: function () {
        return {
          demandTotal: demandTotal,
          placedTotal: placedTotal,
          correctTotal: correctTotal,
          wrongTotal: placedTotal - correctTotal,
          remaining: demandTotal - correctTotal,
          percent: demandTotal === 0 ? 0 : Math.round((correctTotal / demandTotal) * 1000) / 10
        };
      },

      isComplete: function () {
        return correctTotal === demandTotal;
      }
    };
  }

  return { create: create };
});
