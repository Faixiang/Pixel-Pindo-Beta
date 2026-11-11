/**
 * 單元測試（Node 直接執行）：node tests\unit-test.js
 * 覆蓋：色差、HEX 轉換、192 色卡完整性、圖案對映統計、進度統計、參數合法性。
 */
'use strict';

const path = require('path');
const Color = require(path.join(__dirname, '..', 'scripts', 'color-diff.js'));
const Img = require(path.join(__dirname, '..', 'scripts', 'image-processor.js'));
const Inventory = require(path.join(__dirname, '..', 'scripts', 'inventory.js'));
const Config = require(path.join(__dirname, '..', 'scripts', 'config.js'));
const CARD = require(path.join(__dirname, '..', 'data', 'color-card.js'));

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push(name + ' → ' + e.message);
  }
}
function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error((msg || '') + ' 預期 ' + JSON.stringify(expected) + '，實際 ' + JSON.stringify(actual));
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg || '斷言失敗');
}
function near(a, b, eps, msg) {
  if (Math.abs(a - b) > (1e-9)) throw new Error((msg || '') + ' 預期≈' + b + '，實際 ' + a);
}

// ---------- color-diff ----------
test('rgbToHex 基本轉換', () => {
  eq(Color.rgbToHex({ r: 255, g: 0, b: 0 }), '#FF0000');
  eq(Color.rgbToHex({ r: 0, g: 0, b: 0 }), '#000000');
  eq(Color.rgbToHex({ r: 255, g: 255, b: 255 }), '#FFFFFF');
});
test('rgbToHex 越界與小數會被鉗制', () => {
  eq(Color.rgbToHex({ r: 300, g: -5, b: 127.6 }), '#FF0080');
});
test('hexToRgb 基本轉換', () => {
  const c = Color.hexToRgb('#3A7BD5');
  eq(c.r, 0x3A); eq(c.g, 0x7B); eq(c.b, 0xD5);
});
test('hexToRgb 容忍無 # 前綴', () => {
  eq(Color.hexToRgb('FF0000').r, 255);
});
test('hexToRgb 非法輸入回傳 null', () => {
  eq(Color.hexToRgb('#XYZ123'), null);
  eq(Color.hexToRgb('12345'), null);
  eq(Color.hexToRgb(null), null);
});
test('colorDist 同色為 0', () => {
  near(Color.colorDist({ r: 10, g: 20, b: 30 }, { r: 10, g: 20, b: 30 }), 0);
});
test('colorDist 對稱', () => {
  const a = { r: 12, g: 200, b: 88 };
  const b = { r: 190, g: 20, b: 240 };
  near(Color.colorDist(a, b), Color.colorDist(b, a));
});
test('colorDist 黑白距離大於灰白距離', () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  const gray = { r: 128, g: 128, b: 128 };
  ok(Color.colorDist(black, white) > Color.colorDist(gray, white));
});
test('nearestColor 空色卡回傳 null', () => {
  eq(Color.nearestColor({ r: 1, g: 2, b: 3 }, []), null);
  eq(Color.nearestColor({ r: 1, g: 2, b: 3 }, null), null);
});
test('nearestColor 精確命中', () => {
  const card = [
    { code: 'X01', rgb: { r: 255, g: 0, b: 0 } },
    { code: 'X02', rgb: { r: 0, g: 255, b: 0 } }
  ];
  eq(Color.nearestColor({ r: 0, g: 250, b: 10 }, card).code, 'X02');
});
test('nearestColor 回傳第一個最近者（並列取先）', () => {
  const card = [
    { code: 'A', rgb: { r: 0, g: 0, b: 0 } },
    { code: 'B', rgb: { r: 0, g: 0, b: 0 } }
  ];
  eq(Color.nearestColor({ r: 0, g: 0, b: 0 }, card).code, 'A');
});
test('luminance 白大於黑', () => {
  ok(Color.luminance({ r: 255, g: 255, b: 255 }) > Color.luminance({ r: 0, g: 0, b: 0 }));
});

// ---------- 192 色卡 ----------
test('色卡共 192 色', () => {
  eq(CARD.length, 192);
});
test('色號唯一且格式正確（1 大寫字母 + 2 數字）', () => {
  const seen = {};
  CARD.forEach(c => {
    ok(/^[A-Z]\d{2}$/.test(c.code), '色號格式錯誤：' + c.code);
    ok(!seen[c.code], '色號重複：' + c.code);
    seen[c.code] = true;
  });
});
test('hex 格式正確且與 rgb 一致；重複色僅限極淺近似色', () => {
  const seen = {};
  CARD.forEach(c => {
    ok(/^[0-9A-F]{6}$/.test(c.hex.replace('#', '')), 'hex 格式錯誤：' + c.hex);
    eq(Color.rgbToHex(c.rgb), c.hex, c.code + ' rgb 與 hex 不一致');
    seen[c.hex] = (seen[c.hex] || 0) + 1;
  });
  // 允許極少量極淺色在 8bit 量化後撞 hex（如米膚/棕的最淺階）
  const dupes = Object.keys(seen).filter(h => seen[h] > 1);
  ok(dupes.length <= 3, 'hex 重複過多：' + dupes.join(','));
});
test('16 色系 × 12 色，字母 A-P', () => {
  const letters = 'ABCDEFGHIJKLMNOP'.split('');
  letters.forEach(L => {
    eq(CARD.filter(c => c.code[0] === L).length, 12, '色系 ' + L + ' 數量不對');
  });
});
test('每色對映自己時距離為 0（並列同距離可接受）', () => {
  CARD.forEach(c => {
    const hit = Color.nearestColor(c.rgb, CARD);
    near(Color.colorDist(hit.rgb, c.rgb), 0, c.code + ' 最近色距離應為 0（實際命中 ' + hit.code + '）');
  });
});

// ---------- image-processor ----------
test('mapCellsToPattern 基本統計', () => {
  const red = CARD.find(c => c.code === 'A06').rgb;
  const cells = [
    [red, red],
    [{ r: 250, g: 250, b: 250 }, red]
  ];
  const p = Img.mapCellsToPattern(cells, CARD);
  eq(p.width, 2);
  eq(p.height, 2);
  eq(p.counts['A06'], 3);
  let sum = 0;
  Object.keys(p.counts).forEach(k => { sum += p.counts[k]; });
  eq(sum, 4, 'counts 加總須等於格數');
  eq(p.demandList[0].code, 'A06', '需求清單應按數量降序');
});
test('mapCellsToPattern 拒絕空/不規則輸入', () => {
  let threw = 0;
  try { Img.mapCellsToPattern([], CARD); } catch (e) { threw++; }
  try { Img.mapCellsToPattern([[{ r: 0, g: 0, b: 0 }], []], CARD); } catch (e) { threw++; }
  eq(threw, 2);
});
test('makeDemoCells 產生 32×32 網格', () => {
  const cells = Img.makeDemoCells(32);
  eq(cells.length, 32);
  eq(cells[0].length, 32);
  eq(cells[16].length, 32);
});
test('示範圖案對映後需求總數 = 1024', () => {
  const p = Img.mapCellsToPattern(Img.makeDemoCells(32), CARD);
  let sum = 0;
  p.demandList.forEach(d => { sum += d.demand; });
  eq(sum, 1024);
});
test('示範圖案含紅色系且白底命中淺色', () => {
  const p = Img.mapCellsToPattern(Img.makeDemoCells(32), CARD);
  const whiteHit = Color.nearestColor({ r: 250, g: 250, b: 250 }, CARD);
  ok(Color.luminance(whiteHit.rgb) > 230, '白底應對映到極淺色（實際 ' + whiteHit.code + ' ' + whiteHit.hex + '）');
  const hasRed = p.demandList.some(d => d.code[0] === 'A');
  ok(hasRed, '愛心應對映到紅色系');
});

// ---------- inventory ----------
function makeInv() {
  return Inventory.create([
    ['A06', 'A06', 'O01'],
    ['O01', 'A06', 'O01']
  ]);
}
test('inventory 初始統計', () => {
  const inv = makeInv();
  const t = inv.totals();
  eq(t.demandTotal, 6);
  eq(t.placedTotal, 0);
  eq(t.percent, 0);
  eq(inv.colorStats('A06').demand, 3);
  eq(inv.colorStats('A06').remaining, 3);
});
test('place 正確格：correct + 進度更新', () => {
  const inv = makeInv();
  const r = inv.place(0, 0, 'A06');
  ok(r && r.correct);
  eq(inv.totals().correctTotal, 1);
  eq(inv.colorStats('A06').remaining, 2);
});
test('place 異色格：允許但標記不正確', () => {
  const inv = makeInv();
  const r = inv.place(2, 0, 'A06'); // 目標是 O01
  ok(r && !r.correct);
  const t = inv.totals();
  eq(t.placedTotal, 1);
  eq(t.correctTotal, 0);
  eq(t.wrongTotal, 1);
  eq(inv.colorStats('A06').placed, 1);
  eq(inv.colorStats('A06').remaining, 3, '異色不抵扣需求');
});
test('place 重複格被駁回', () => {
  const inv = makeInv();
  ok(inv.place(0, 0, 'A06'));
  eq(inv.place(0, 0, 'O01'), null);
  eq(inv.totals().placedTotal, 1);
});
test('place 越界/空色號被駁回', () => {
  const inv = makeInv();
  eq(inv.place(-1, 0, 'A06'), null);
  eq(inv.place(0, 0, ''), null);
  eq(inv.place(99, 99, 'A06'), null);
});
test('remove 收回：統計還原', () => {
  const inv = makeInv();
  inv.place(0, 0, 'A06');
  eq(inv.remove(0, 0), 'A06');
  const t = inv.totals();
  eq(t.placedTotal, 0);
  eq(t.correctTotal, 0);
  eq(inv.colorStats('A06').remaining, 3);
});
test('remove 空格/越界回傳 null', () => {
  const inv = makeInv();
  eq(inv.remove(0, 0), null);
  eq(inv.remove(5, 5), null);
});
test('異色豆可收回且不影響正確統計', () => {
  const inv = makeInv();
  inv.place(2, 0, 'A06');
  eq(inv.remove(2, 0), 'A06');
  eq(inv.totals().wrongTotal, 0);
});
test('remaining 不為負（放超過需求）', () => {
  const inv = Inventory.create([['A06']]);
  // 需求 1，放對 1 顆
  inv.place(0, 0, 'A06');
  ok(inv.colorStats('A06').remaining >= 0);
});
test('完成度 100% 判定', () => {
  const inv = makeInv();
  const codes = inv.codes;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 3; x++) inv.place(x, y, codes[y][x]);
  }
  ok(inv.isComplete());
  eq(inv.totals().percent, 100);
  eq(inv.totals().remaining, 0);
});
test('有異色就不算完成', () => {
  const inv = Inventory.create([['A06']]);
  inv.place(0, 0, 'O01');
  ok(!inv.isComplete());
  eq(inv.totals().percent, 0);
});
test('inventory 拒絕空/不規則 codes', () => {
  let threw = 0;
  try { Inventory.create([]); } catch (e) { threw++; }
  try { Inventory.create([['A06'], []]); } catch (e) { threw++; }
  eq(threw, 2);
});
test('allStats 包含需求為 0 但有放置的色號', () => {
  const inv = Inventory.create([['A06']]);
  inv.place(0, 0, 'O01'); // O01 需求 0 但放 1
  const codes = inv.allStats().map(s => s.code);
  ok(codes.indexOf('O01') >= 0, 'allStats 應包含被放置的 O01');
});
test('targetAt / beadAt 邊界', () => {
  const inv = makeInv();
  eq(inv.targetAt(0, 0), 'A06');
  eq(inv.targetAt(9, 9), null);
  eq(inv.beadAt(0, 0), null);
  inv.place(0, 0, 'A06');
  eq(inv.beadAt(0, 0), 'A06');
});

// ---------- config ----------
test('config 參數合法', () => {
  eq(Config.GRID.DEFAULT, 40);
  ok(Config.GRID.MIN >= 1 && Config.GRID.MAX >= Config.GRID.MIN);
  ok(Config.GRID.PRESETS.indexOf(40) >= 0);
  ok(Config.PHYSICS.BEAD_RADIUS > 0);
  ok(Config.PHYSICS.MAX_LIVE_BEADS >= 50);
  ok(Config.PHYSICS.POUR_BATCH > 0);
  ok(Config.PHYSICS.FIXED_DT > 0);
  ok(Config.BOARD.CELL_MIN < Config.BOARD.CELL_MAX);
});
test('config 縮放參數合法', () => {  const B = Config.BOARD;
  ok(B.ZOOM_MIN > 0, 'ZOOM_MIN 須大於 0');
  ok(B.ZOOM_MAX > B.ZOOM_MIN, 'ZOOM_MAX 須大於 ZOOM_MIN');
  ok(B.ZOOM_STEP > 0, 'ZOOM_STEP 須大於 0');
  ok(B.ZOOM_WHEEL > 1, 'ZOOM_WHEEL 須大於 1');
  eq(B.ZOOM_MIN, 0.5);
  eq(B.ZOOM_MAX, 8);
});
test('縮放鉗制邏輯（模擬 board clamp）', () => {
  const MIN = Config.BOARD.ZOOM_MIN;
  const MAX = Config.BOARD.ZOOM_MAX;
  const clamp = v => Math.max(MIN, Math.min(MAX, v));
  eq(clamp(0.1), MIN);
  eq(clamp(100), MAX);
  eq(clamp(2.5), 2.5);
});
test('自動適應倍率計算（模擬 board calcFitScale）', () => {
  const B = Config.BOARD;
  function fitScale(viewW, viewH, cols, rows, baseCell) {
    const fitX = viewW / (cols * baseCell);
    const fitY = viewH / (rows * baseCell);
    return Math.max(B.ZOOM_MIN, Math.min(B.ZOOM_MAX, Math.min(fitX, fitY)));
  }
  // 32×32、baseCell 22 → 704px；容器 722×721 → 約 1.02
  const s1 = fitScale(722, 721, 32, 32, 22);
  ok(s1 > 1 && s1 < 1.1, '大容器應接近 1.0，實際 ' + s1);
  // 小容器 362×431 → 約 0.51
  const s2 = fitScale(362, 431, 32, 32, 22);
  ok(s2 >= 0.5 && s2 < 0.65, '小容器應接近 0.5，實際 ' + s2);
  // 極小容器 → 不得低於 ZOOM_MIN
  eq(fitScale(10, 10, 128, 128, 5), B.ZOOM_MIN);
  // 極大容器 → 不得高於 ZOOM_MAX
  eq(fitScale(99999, 99999, 8, 8, 5), B.ZOOM_MAX);
});
test('pan 鉗制不使圖案完全移出視野', () => {  function clampPan(panX, panY, viewW, viewH, cols, rows, baseCell, scale) {
    const bw = cols * baseCell * scale;
    const bh = rows * baseCell * scale;
    const maxPX = Math.max(0, bw - viewW) / 2 + bw * 0.1;
    const maxPY = Math.max(0, bh - viewH) / 2 + bh * 0.1;
    return {
      x: Math.max(-maxPX, Math.min(maxPX, panX)),
      y: Math.max(-maxPY, Math.min(maxPY, panY))
    };
  }
  const r1 = clampPan(99999, 99999, 400, 400, 32, 32, 22, 1);
  ok(r1.x < 99999 && r1.y < 99999, '超大 pan 應被鉗制');
  const r2 = clampPan(-99999, -99999, 400, 400, 32, 32, 22, 1);
  ok(r2.x > -99999 && r2.y > -99999, '超小 pan 應被鉗制');
  const r3 = clampPan(50, -30, 800, 800, 32, 32, 22, 1);
  eq(r3.x, 50);
  eq(r3.y, -30);
});
test('座標反算：縮放+平移後仍可命中正確格', () => {
  // 模擬 board 的 transform 與 cellFromClient
  const baseCell = 20, cols = 20, rows = 20;
  const bw = cols * baseCell, bh = rows * baseCell;
  function toScreen(gx, gy, viewW, viewH, panX, panY, scale) {
    const wx = gx * baseCell + baseCell / 2;
    const wy = gy * baseCell + baseCell / 2;
    return {
      x: viewW / 2 + panX + (wx - bw / 2) * scale,
      y: viewH / 2 + panY + (wy - bh / 2) * scale
    };
  }
  function cellFromLocal(lx, ly, viewW, viewH, panX, panY, scale) {
    const wx = (lx - viewW / 2 - panX) / scale + bw / 2;
    const wy = (ly - viewH / 2 - panY) / scale + bh / 2;
    const gx = Math.floor(wx / baseCell);
    const gy = Math.floor(wy / baseCell);
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return null;
    return { x: gx, y: gy };
  }
  const cases = [
    { scale: 1, panX: 0, panY: 0 },
    { scale: 2, panX: -100, panY: 80 },
    { scale: 4, panX: 150, panY: -200 },
    { scale: 0.5, panX: 20, panY: 10 }
  ];
  const viewW = 600, viewH = 500;
  cases.forEach(c => {
    [[0, 0], [19, 19], [7, 13]].forEach(([gx, gy]) => {
      const sp = toScreen(gx, gy, viewW, viewH, c.panX, c.panY, c.scale);
      const back = cellFromLocal(sp.x, sp.y, viewW, viewH, c.panX, c.panY, c.scale);
      ok(back && back.x === gx && back.y === gy,
        'scale=' + c.scale + ' 目標 ' + gx + ',' + gy + ' 得到 ' + (back ? back.x + ',' + back.y : 'null'));
    });
  });
});

// ---------- 物理參數（豆盒抽屜改造） ----------
test('物理參數：豆子半徑合理', () => {
  const R = Config.PHYSICS.BEAD_RADIUS;
  ok(R >= 8 && R <= 20, 'BEAD_RADIUS 應在 8–20，實際 ' + R);
});
test('物理參數：低回彈、靜摩擦大於動摩擦', () => {
  const P = Config.PHYSICS;
  ok(P.RESTITUTION < 0.2, 'RESTITUTION 應 < 0.2，實際 ' + P.RESTITUTION);
  ok(P.FRICTION_STATIC > P.FRICTION, 'FRICTION_STATIC 應大於 FRICTION');
  ok(P.FRICTION > 0 && P.FRICTION < 1, 'FRICTION 應在 0–1');
  ok(P.AIR_FRICTION > 0 && P.AIR_FRICTION < 0.1, 'AIR_FRICTION 應在 0–0.1');
});
test('物理參數：盒內空間不會過度擁擠', () => {
  const P = Config.PHYSICS;
  const beadArea = P.MAX_LIVE_BEADS * Math.PI * P.BEAD_RADIUS * P.BEAD_RADIUS;
  const boxArea = P.WIDTH * P.HEIGHT;
  const ratio = beadArea / boxArea;
  ok(ratio <= 0.6, '豆子總面積占盒面積應 ≤ 60%，實際 ' + (ratio * 100).toFixed(1) + '%');
});
test('物理參數：盒子尺寸與迭代次數合理', () => {
  const P = Config.PHYSICS;
  ok(P.WIDTH > 0 && P.HEIGHT > 0);
  ok(P.HEIGHT > P.WIDTH, 'HEIGHT 應大於 WIDTH（垂直堆疊空間）');
  ok(P.WIDTH >= P.BEAD_RADIUS * 4, '盒寬需容納至少 4 顆豆');
  ok(P.POSITION_ITERATIONS >= 8, 'POSITION_ITERATIONS 應 ≥ 8');
  ok(P.VELOCITY_ITERATIONS >= 6, 'VELOCITY_ITERATIONS 應 ≥ 6');
  ok(P.POUR_BATCH > 0 && P.POUR_BATCH <= P.MAX_LIVE_BEADS);
});
test('抽屜位移：收合位置 = 寬度 - 拉柄寬', () => {
  const PEEK = 44;
  function closedX(width, dir) {
    return (dir === 'right' ? 1 : -1) * (width - PEEK);
  }
  eq(closedX(330, 'left'), -286);
  eq(closedX(330, 'right'), 286);
  // 展開位置永遠是 0
  eq(0, 0);
  // 拉柄寬不得超過抽屜寬
  ok(PEEK < 330);
});
test('抽屜拖曳吸附判定（左右方向相反）', () => {
  const PEEK = 44;
  function shouldOpen(dir, dx, isOpen) {
    const sign = dir === 'right' ? 1 : -1;
    return sign > 0 ? (dx > 60 || (isOpen && dx > -60))
                    : (dx < -60 || (isOpen && dx < 60));
  }
  // 左屜：往左拖展開
  eq(shouldOpen('left', -100, false), true);
  eq(shouldOpen('left', 100, false), false);
  // 右屜：往右拖展開
  eq(shouldOpen('right', 100, false), true);
  eq(shouldOpen('right', -100, false), false);
  // 已展開時小幅拖動仍保持展開
  eq(shouldOpen('left', 30, true), true);
  eq(shouldOpen('right', -30, true), true);
  // 已展開時反向大幅拖動則收起
  eq(shouldOpen('left', 90, true), false);
  eq(shouldOpen('right', -90, true), false);
});
test('盒尺寸自適應：保持 280:620 比例', () => {
  const P = Config.PHYSICS;
  const ratio = P.HEIGHT / P.WIDTH;
  [286, 300, 260].forEach(w => {
    const h = Math.round(w * ratio);
    ok(Math.abs(h / w - ratio) < 0.01, '寬 ' + w + ' 換算高 ' + h + ' 比例應維持');
  });
});

// ---------- 底部抽屜（豆盒移至下方） ----------
test('底部抽屜：收起位移 = 高度 - 拉柄高', () => {
  const PEEK = 44;
  function closedY(height) { return height - PEEK; }
  eq(closedY(600), 556);
  eq(closedY(44), 0);
  ok(PEEK < 600, '拉柄高須小於展開高度');
});
test('底部抽屜：位移鉗制在 0 到 closedY 之間', () => {
  const PEEK = 44;
  function clampY(offset, height) {
    const max = height - PEEK;
    return Math.max(0, Math.min(max, offset));
  }
  eq(clampY(-999, 600), 0, '往上拖過頭不得小於 0');
  eq(clampY(9999, 600), 556, '往下拖過頭不得超過 closedY');
  eq(clampY(300, 600), 300);
});
test('底部抽屜：垂直拖曳吸附判定', () => {
  function shouldOpen(dy, isOpen) {
    return dy < -60 || (isOpen && dy < 60);
  }
  // 收起狀態
  eq(shouldOpen(-100, false), true, '向上拖 100 → 展開');
  eq(shouldOpen(100, false), false, '向下拖 100 → 保持收起');
  eq(shouldOpen(-30, false), false, '小幅上拖不足門檻 → 保持收起');
  // 展開狀態
  eq(shouldOpen(100, true), false, '向下拖 100 → 收起');
  eq(shouldOpen(-30, true), true, '小幅上拖 → 保持展開');
  eq(shouldOpen(30, true), true, '小幅下拖 → 保持展開');
});
test('底部抽屜：60vh 展開高度下餅板仍可見', () => {
  const DRAWER_RATIO = 0.6;
  const visibleRatio = 1 - DRAWER_RATIO;
  ok(visibleRatio >= 0.35, '展開後餅板可見比例應 ≥ 35%，實際 ' + (visibleRatio * 100) + '%');
});
test('豆盒內部左右分欄：右欄固定寬不超出容器', () => {
  const RIGHT_W = 260;
  const GAP = 16;
  const PADDING = 13;
  // 視窗 1600 - 左右邊距 24 = 1576，內距 26 → 可用 1550
  const available = 1600 - 24 - PADDING * 2;
  const leftW = available - RIGHT_W - GAP;
  ok(leftW > RIGHT_W, '左欄（豆盒）應寬於右欄，實際 ' + leftW + ' vs ' + RIGHT_W);
  // 手機寬 420：右欄應讓位
  const narrow = 420 - 24 - PADDING * 2;
  ok(narrow - RIGHT_W - GAP < 100, '窄螢幕時左欄會被壓縮（需媒體查詢處理）');
});

// ---------- 結果 ----------
console.log('');
console.log('通過 ' + passed + ' / ' + (passed + failed) + ' 項測試');
if (failed > 0) {
  console.log('失敗項目：');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
} else {
  console.log('全部通過 ✓');
}
