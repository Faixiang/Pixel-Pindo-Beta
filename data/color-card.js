/**
 * 內建 192 色標準拼豆色卡（16 色系 × 12 深淺）
 * 色號格式：1 大寫字母（色系）+ 2 位數字（01 最淺 → 12 最深），如 A01、H07。
 * 以 HSL 規則确定性生成，匯出為 { code, name, hex, rgb } 陣列。
 * 掛到 window.BEAD_COLOR_CARD；Node 測試環境走 module.exports。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BEAD_COLOR_CARD = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // 16 色系：hue（0-360）、saturation 基準、中文名
  var FAMILIES = [
    { letter: 'A', hue: 0,   sat: 78, name: '紅' },
    { letter: 'B', hue: 330, sat: 72, name: '粉紅' },
    { letter: 'C', hue: 24,  sat: 85, name: '橙' },
    { letter: 'D', hue: 48,  sat: 88, name: '黃' },
    { letter: 'E', hue: 70,  sat: 62, name: '黃綠' },
    { letter: 'F', hue: 100, sat: 58, name: '草綠' },
    { letter: 'G', hue: 140, sat: 55, name: '綠' },
    { letter: 'H', hue: 172, sat: 60, name: '青' },
    { letter: 'I', hue: 200, sat: 72, name: '天藍' },
    { letter: 'J', hue: 225, sat: 68, name: '藍' },
    { letter: 'K', hue: 262, sat: 58, name: '紫' },
    { letter: 'L', hue: 292, sat: 55, name: '紫紅' },
    { letter: 'M', hue: 28,  sat: 42, name: '棕' },
    { letter: 'N', hue: 38,  sat: 34, name: '米膚' },
    { letter: 'O', hue: 0,   sat: 0,  name: '黑白灰' },
    { letter: 'P', hue: 215, sat: 30, name: '深色系' }
  ];

  // 12 階亮度（%）：01 最淺 → 12 最深
  var LIGHTNESS = [98, 90, 84, 78, 71, 64, 57, 50, 43, 36, 27, 16];

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = l - c / 2;
    var r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  function rgbToHex(rgb) {
    function h(v) { return v.toString(16).padStart(2, '0'); }
    return ('#' + h(rgb.r) + h(rgb.g) + h(rgb.b)).toUpperCase();
  }

  var card = [];
  FAMILIES.forEach(function (fam) {
    // 黑白灰 01 直接給純白（#FFFFFF），確保白色圖底命中 O01 而非其他淺色
    if (fam.letter === 'O') {
      card.push({ code: 'O01', name: fam.name + '01', family: fam.name, hex: '#FFFFFF', rgb: { r: 255, g: 255, b: 255 } });
    }
    LIGHTNESS.forEach(function (light, idx) {
      if (fam.letter === 'O' && idx === 0) return; // 已手動加入純白
      // 極淺色降低飽和避免螢光感；極深色微降飽和
      // 非灰色系（sat>0）保留最低 12% 飽和，避免退化成灰色而與 O 系重複
      var sat = fam.sat;
      var satFloor = fam.sat === 0 ? 0 : 12;
      if (idx === 0) sat = Math.max(satFloor, sat - 40);
      else if (idx === 1) sat = Math.max(satFloor, sat - 15);
      else if (idx >= 10) sat = Math.max(satFloor, sat - 8);
      var rgb = hslToRgb(fam.hue, sat, light);
      var code = fam.letter + String(idx + 1).padStart(2, '0');
      card.push({
        code: code,
        name: fam.name + String(idx + 1).padStart(2, '0'),
        family: fam.name,
        hex: rgbToHex(rgb),
        rgb: rgb
      });
    });
  });

  return card;
});
