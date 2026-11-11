/**
 * 全域參數集中表：板尺寸、豆盒物理、渲染常數。
 * 掛到 window.BeadConfig；Node 測試環境走 module.exports。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BeadConfig = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  return {
    // 圖片 → 網格
    GRID: {
      DEFAULT: 40,
      PRESETS: [29, 40, 58, 80, 104],
      MIN: 8,
      MAX: 128
    },

    // 物理豆盒
    PHYSICS: {
      WIDTH: 280,          // 豆盒內部寬（世界座標 px）
      HEIGHT: 620,         // 豆盒內部高
      BEAD_RADIUS: 13,
      GRAVITY_Y: 0.7,      // 較低重力，減少高速穿透與彈跳
      FRICTION: 0.55,
      FRICTION_STATIC: 0.85,
      RESTITUTION: 0.05,   // 幾乎不反彈，落地即停
      AIR_FRICTION: 0.02,
      FIXED_DT: 1000 / 60, // 固定步長 ms
      MAX_LIVE_BEADS: 120, // 盒內活體豆上限（性能保護）
      POUR_BATCH: 20,      // 每次倒豆數量
      POSITION_ITERATIONS: 10,
      VELOCITY_ITERATIONS: 8
    },

    // 釘板渲染
    BOARD: {
      MAX_DISPLAY: 720,    // 釘板 canvas 最長邊 px
      CELL_MIN: 5,
      CELL_MAX: 22,
      GHOST_ALPHA: 0.22,   // 幽靈目標色透明度
      ZOOM_MIN: 0.5,
      ZOOM_MAX: 8,
      ZOOM_STEP: 0.25,     // 滑桿步進
      ZOOM_WHEEL: 1.15     // 滾輪每次倍率因子
    }
  };
});
