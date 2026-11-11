/**
 * 主控：串接圖片處理、色號清單、物理豆盒、釘板。
 * 狀態：img / pattern / inventory / selectedCode / draggingBody
 */
(function () {
  'use strict';

  var CARD = window.BEAD_COLOR_CARD;
  var CFG = window.BeadConfig;
  var Color = window.BeadColor;
  var Img = window.BeadImage;
  var Inventory = window.BeadInventory;

  // ---------- DOM ----------
  function $(id) { return document.getElementById(id); }
  var photoDrop = $('photoDrop');
  var photoInput = $('photoInput');
  var photoName = $('photoName');
  var demoBtn = $('demoBtn');
  var presetsEl = $('presets');
  var gwInput = $('gw');
  var ghInput = $('gh');
  var applyBtn = $('applyBtn');
  var genHint = $('genHint');
  var paletteList = $('paletteList');
  var paletteEmpty = $('paletteEmpty');
  var exportBtn = $('exportBtn');
  var progressFill = $('progressFill');
  var progressText = $('progressText');
  var boardCanvas = $('boardCanvas');
  var boardPlaceholder = $('boardPlaceholder');
  var ghostToggle = $('ghostToggle');
  var boxCanvas = $('boxCanvas');
  var pourBtn = $('pourBtn');
  var shakeBtn = $('shakeBtn');
  var clearBoxBtn = $('clearBoxBtn');
  var selectedInfo = $('selectedInfoDrawer');
  var boxCount = $('boxCount');
  var boardTip = $('boardTip');
  var completeBanner = $('completeBanner');
  var dragGhost = $('dragGhost');

  // ---------- 抽屜控制（左右兩屜共用） ----------
  var DRAWER_PEEK = 44; // 收合時露出的拉柄寬

  /**
   * 建立抽屜控制器。
   * dir: 'left' 往左位移、'right' 往右位移、'bottom' 往下位移（向上拉出）。
   */
  function createDrawer(el, handle, closeBtn, dir) {
    var isVertical = dir === 'bottom';
    var sign = dir === 'right' ? 1 : (dir === 'bottom' ? 1 : -1);
    var state = null;
    var THRESHOLD = 4;

    function closedOffset() {
      return isVertical
        ? el.offsetHeight - DRAWER_PEEK
        : el.offsetWidth - DRAWER_PEEK;
    }
    function isOpen() { return el.classList.contains('open'); }

    function applyTransform(offset) {
      if (isVertical) {
        // 收起時向下位移；展開時 0
        var y = Math.max(0, Math.min(closedOffset(), offset));
        el.style.transform = 'translateY(' + y + 'px)';
      } else {
        var lo = Math.min(0, sign * closedOffset());
        var hi = Math.max(0, sign * closedOffset());
        var x = Math.max(lo, Math.min(hi, offset));
        el.style.transform = 'translateX(' + x + 'px)';
      }
    }

    function set(open, animate) {
      if (!animate) el.style.transition = 'none';
      el.style.transform = '';
      el.classList.toggle('open', open);
      el.setAttribute('aria-hidden', String(!open));
      if (!animate) { void el.offsetWidth; el.style.transition = ''; }
    }

    closeBtn.addEventListener('click', function () { set(false); });
    el.addEventListener('transitionend', function () {
      el.setAttribute('aria-hidden', String(!isOpen()));
    });

    handle.addEventListener('pointerdown', function (e) {
      state = {
        start: isVertical ? e.clientY : e.clientX,
        base: isOpen() ? 0 : (isVertical ? closedOffset() : sign * closedOffset()),
        moved: false,
        pointerId: e.pointerId
      };
      el.style.transition = 'none';
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });

    handle.addEventListener('pointermove', function (e) {
      if (!state) return;
      var d = (isVertical ? e.clientY : e.clientX) - state.start;
      if (Math.abs(d) > THRESHOLD) state.moved = true;
      applyTransform(state.base + d);
    });

    handle.addEventListener('pointerup', function (e) {
      if (!state) return;
      var d = (isVertical ? e.clientY : e.clientX) - state.start;
      var moved = state.moved;
      var pid = state.pointerId;
      state = null;
      el.style.transition = '';
      try { handle.releasePointerCapture(pid); } catch (err) {}

      if (!moved) { set(!isOpen()); return; }

      var openByDrag;
      if (isVertical) {
        // 向上拖（負值）展開；向下拖（正值）收起
        openByDrag = d < -60 || (isOpen() && d < 60);
      } else if (sign > 0) {
        openByDrag = d > 60 || (isOpen() && d > -60);
      } else {
        openByDrag = d < -60 || (isOpen() && d < 60);
      }
      set(openByDrag);
    });

    handle.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        set(!isOpen());
      }
    });

    set(false, false);
    return { set: set, isOpen: isOpen, el: el };
  }

  var menuDrawer = createDrawer($('sideDrawer'), $('drawerHandle'), $('drawerClose'), 'left');
  var boxDrawer = createDrawer($('boxDrawer'), $('boxDrawerHandle'), $('boxDrawerClose'), 'bottom');
  var imageLibDrawer = createDrawer($('libDrawer'), $('libDrawerHandle'), $('libDrawerClose'), 'right');

  // 拉柄上的「抽出豆盒」按鈕：獨立開關豆盒抽屜（不觸發拉柄拖曳）
  var boxPullBtn = $('boxPullBtn');
  var boxPullText = boxPullBtn.querySelector('.pull-text');
  var boxPullIcon = boxPullBtn.querySelector('.pull-icon');
  var boxDrawerEl = $('boxDrawer');
  var boxFloat = $('boxFloat');
  var boxFloatHead = $('boxFloatHead');
  var boxFloatClose = $('boxFloatClose');
  var boxSlot = $('boxSlot');
  var boxFloatSlot = $('boxFloatSlot');
  var boxWrapEl = $('boxWrap');

  /** 豆盒是否已抽出到浮窗 */
  function isBoxFloating() { return boxFloat.classList.contains('show'); }

  function syncPullBtn() {
    var floating = isBoxFloating();
    boxPullText.textContent = floating ? '收回' : '抽出';
    boxPullIcon.textContent = floating ? '⇲' : '⇱';
    var label = floating ? '收回物理豆盒' : '單獨抽出物理豆盒';
    boxPullBtn.title = label;
    boxPullBtn.setAttribute('aria-label', label);
    boxPullBtn.classList.toggle('is-floating', floating);
  }

  /** 豆盒 canvas 在抽屜槽 / 浮窗之間搬家 */
  function mountBoxCanvas(target) {
    if (boxWrapEl.parentElement === target) return;
    target.appendChild(boxWrapEl);
    observeBoxHost();
    // 搬家後容器尺寸改變，重算物理世界
    requestAnimationFrame(function () { scheduleSyncBoxSize(); box.renderOnce(); });
  }

  /** 抽出豆盒：canvas 移到浮窗，尺寸與抽屜內完全一致 */
  function popOutBox() {
    if (isBoxFloating()) return;
    // 記下抽屜內豆盒尺寸，浮窗內沿用相同尺寸
    var baseW = box.width;
    var baseH = box.height;

    boxFloat.classList.add('show');
    boxFloat.setAttribute('aria-hidden', 'false');
    boxFloatSlot.appendChild(boxWrapEl);
    observeBoxHost();

    // 浮窗尺寸 = 豆盒尺寸 + 外框（左右各 10 內距 + 2 邊框）
    var PAD_X = 24;
    var CHROME_Y = 95;
    boxFloat.style.width = Math.max(280, baseW + PAD_X) + 'px';
    boxFloat.style.height = Math.max(240, baseH + CHROME_Y) + 'px';
    // 豆盒容器佔滿剩餘空間（可隨浮窗縮放）
    boxFloatSlot.style.flex = '1 1 auto';
    boxFloatSlot.style.height = '';
    boxFloatSlot.style.width = '100%';
    ensureFloatVisible();
    boxDrawer.set(false);
    syncPullBtn();

    void boxFloatSlot.offsetHeight;
    // 初始尺寸與抽屜內一致
    applyBoxSize(baseW, baseH);
    box.renderOnce();

    // 啟動浮窗縮放監聽（自由調整，但受豆子數量限制下限）
    startFloatResizeWatch();
    updateFloatMinSize();
  }

  /** 依豆子數量計算浮窗最小尺寸（保證豆子不會擠出邊界） */
  function updateFloatMinSize() {
    if (!isBoxFloating()) return;
    var P = CFG.PHYSICS;
    var n = Math.max(1, box.liveCount());
    var D = P.BEAD_RADIUS * 2;   // 豆子直徑

    // 以「單層平鋪」為安全下限：寬度需容納每層豆數，高度需容納層數 × 直徑
    // 取寬高比 2.2:1 的長盒，每層可放 cols 顆，層數 rows
    var ratio = 2.2;
    var cols = Math.ceil(Math.sqrt((n * ratio) / 1.0));
    var rows = Math.ceil(n / cols);
    // 每顆豆佔 1.15 倍直徑（含間隙）
    var minBoxW = cols * D * 1.15;
    var minBoxH = rows * D * 1.15 + D * 2;
    // 高度不足時放寬（避免過窄長條）
    if (minBoxH < D * 5) minBoxH = D * 5;

    var CHROME_Y = 95, PAD_X = 24;
    var minW = Math.ceil(minBoxW + PAD_X);
    var minH = Math.ceil(minBoxH + CHROME_Y);

    minW = Math.max(280, Math.min(minW, window.innerWidth - 32));
    minH = Math.max(240, Math.min(minH, window.innerHeight - 120));
    boxFloat.style.minWidth = minW + 'px';
    boxFloat.style.minHeight = minH + 'px';

    var r = boxFloat.getBoundingClientRect();
    if (r.width < minW) boxFloat.style.width = minW + 'px';
    if (r.height < minH) boxFloat.style.height = minH + 'px';
    return { minW: minW, minH: minH, cols: cols, rows: rows };
  }

  // 浮窗尺寸監聽：尺寸變化時重算豆盒世界
  var floatResizeObserver = null;
  function startFloatResizeWatch() {
    if (typeof ResizeObserver === 'undefined' || floatResizeObserver) return;
    floatResizeObserver = new ResizeObserver(function () {
      if (!isBoxFloating()) return;
      var r = boxFloatSlot.getBoundingClientRect();
      var w = Math.floor(r.width) - 2;
      var h = Math.floor(r.height) - 2;
      if (w < 1 || h < 1) return;
      if (w === lastW && h === lastH) return;
      applyBoxSize(w, h);
      box.clampAll();
      box.renderOnce();
    });
    floatResizeObserver.observe(boxFloatSlot);
  }

  /** 固定豆盒尺寸（同時設定 canvas CSS 尺寸，保證不變形） */
  function applyBoxSize(w, h) {
    w = Math.round(w);
    h = Math.round(h);
    if (w < 1 || h < 1) return;
    lastW = w;
    lastH = h;
    boxWrapEl.style.width = w + 'px';
    boxWrapEl.style.height = h + 'px';
    box.resize(w, h);
    var cv = box.canvas;
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    cv.style.maxWidth = 'none';
    cv.style.maxHeight = 'none';
  }
  /** 收回豆盒：canvas 回到抽屜槽，並展開抽屜 */
  function dockBox() {
    if (!isBoxFloating()) return;
    boxFloat.classList.remove('show');
    boxFloat.setAttribute('aria-hidden', 'true');
    // 清除浮窗尺寸限制與監聽
    if (floatResizeObserver) { floatResizeObserver.disconnect(); floatResizeObserver = null; }
    boxFloat.style.minWidth = '';
    boxFloat.style.minHeight = '';
    boxDrawer.set(true);
    syncPullBtn();
    // 等抽屜展開動畫結束再搬家與量測，避免量到過渡中的尺寸
    setTimeout(function () {
      boxSlot.appendChild(boxWrapEl);
      observeBoxHost();
      var slot = boxWrapEl.parentElement;
      var r = slot.getBoundingClientRect();
      boxWrapEl.style.width = Math.round(r.width) + 'px';
      boxWrapEl.style.height = Math.round(r.height) + 'px';
      lastW = 0; lastH = 0;
      scheduleSyncBoxSize();
    }, 340);
  }

  /** 確保浮窗不出視窗（拖拉或小螢幕時） */
  function ensureFloatVisible() {
    var r = boxFloat.getBoundingClientRect();
    var maxLeft = window.innerWidth - r.width - 8;
    var maxTop = window.innerHeight - r.height - 8;
    var left = Math.max(8, Math.min(maxLeft, r.left));
    var top = Math.max(8, Math.min(maxTop, r.top));
    boxFloat.style.left = left + 'px';
    boxFloat.style.top = top + 'px';
    boxFloat.style.right = 'auto';
  }

  boxPullBtn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  boxPullBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    e.preventDefault();
    if (isBoxFloating()) dockBox();
    else popOutBox();
  });
  boxFloatClose.addEventListener('click', function (e) {
    e.stopPropagation();
    dockBox();
  });

  // 浮窗拖曳（拖標題列）
  var floatDrag = null;
  boxFloatHead.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.box-float-close')) return;
    var r = boxFloat.getBoundingClientRect();
    floatDrag = { dx: e.clientX - r.left, dy: e.clientY - r.top, pointerId: e.pointerId };
    boxFloat.classList.add('dragging');
    try { boxFloatHead.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  boxFloatHead.addEventListener('pointermove', function (e) {
    if (!floatDrag) return;
    var r = boxFloat.getBoundingClientRect();
    var left = Math.max(8, Math.min(window.innerWidth - r.width - 8, e.clientX - floatDrag.dx));
    var top = Math.max(8, Math.min(window.innerHeight - r.height - 8, e.clientY - floatDrag.dy));
    boxFloat.style.left = left + 'px';
    boxFloat.style.top = top + 'px';
    boxFloat.style.right = 'auto';
  });
  boxFloatHead.addEventListener('pointerup', function (e) {
    if (!floatDrag) return;
    try { boxFloatHead.releasePointerCapture(floatDrag.pointerId); } catch (err) {}
    floatDrag = null;
    boxFloat.classList.remove('dragging');
  });

  boxDrawerEl.addEventListener('transitionend', function () { scheduleSyncBoxSize(); syncPullBtn(); });
  $('boxDrawerClose').addEventListener('click', function () { setTimeout(syncBoxSize, 350); syncPullBtn(); });
  syncPullBtn();

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (menuDrawer.isOpen()) menuDrawer.set(false);
    if (boxDrawer.isOpen()) boxDrawer.set(false);
    if (imageLibDrawer.isOpen()) imageLibDrawer.set(false);
  });

  // ---------- 左側選單區塊（單一連續面板） ----------
  var tabBadge = $('tabBadge');

  // ---------- 狀態 ----------
  var img = null;
  var imgCrop = null;    // { sx, sy, sw, sh } 或 null（用整張圖）
  var pattern = null;    // {width,height,codes,counts,demandList}
  var inventory = null;
  var selectedCode = null;
  var draggingBody = null;
  var dragLastInBox = null; // 拖曳中最後一個合法盒內位置

  // ---------- 模組實例 ----------
  var board = window.BeadBoard.create(boardCanvas);
  board.setPalette(CARD);
  var box = window.BeadPhysicsBox.create(boxCanvas);
  box.setDraggingProvider(function () { return draggingBody; });

  /** 依豆盒所在容器的可用區域同步物理世界尺寸（僅抽屜槽） */
  var syncRaf = 0;
  var lastW = 0, lastH = 0;
  function syncBoxSize() {
    if (!boxWrapEl) return;
    // 浮窗内尺寸固定為抽出當下的大小，不隨容器變化
    if (boxFloat && boxFloat.classList.contains('show')) return;
    var slot = boxWrapEl.parentElement;
    if (!slot) return;
    // 用 clientWidth/clientHeight（不含邊框與滾動條），避免 canvas 超出容器
    var w = Math.floor(slot.clientWidth);
    var h = Math.floor(slot.clientHeight);
    // 預留 2px 避免圓角邊框裁切
    w = Math.max(1, w - 2);
    h = Math.max(1, h - 2);
    if (w < 1 || h < 1) return;
    if (w === lastW && h === lastH) return;
    applyBoxSize(w, h);
  }

  /** 下一幀（等版面穩定）後重算，避免量到動畫中間值 */
  function scheduleSyncBoxSize() {
    if (syncRaf) cancelAnimationFrame(syncRaf);
    syncRaf = requestAnimationFrame(function () {
      syncRaf = requestAnimationFrame(function () {
        syncRaf = 0;
        syncBoxSize();
        box.renderOnce();
      });
    });
  }

  // 同時觀察容器本身與其父層（浮窗拖拽 resize 時父層先變）
  var boxSizeObserver = null;
  function observeBoxHost() {
    if (typeof ResizeObserver === 'undefined') return;
    if (boxSizeObserver) boxSizeObserver.disconnect();
    var slot = boxWrapEl && boxWrapEl.parentElement;
    if (!slot) return;
    boxSizeObserver = new ResizeObserver(function () { scheduleSyncBoxSize(); });
    boxSizeObserver.observe(boxWrapEl);
  }
  observeBoxHost();
  window.addEventListener('resize', function () {
    scheduleSyncBoxSize();
    if (isBoxFloating()) ensureFloatVisible();
  });

  function cardOf(code) {
    for (var i = 0; i < CARD.length; i++) if (CARD[i].code === code) return CARD[i];
    return null;
  }

  // ---------- 圖片處理（模組 1） ----------
  function clampGrid(v) {
    v = parseInt(v, 10);
    if (isNaN(v)) return CFG.GRID.DEFAULT;
    return Math.max(CFG.GRID.MIN, Math.min(CFG.GRID.MAX, v));
  }

  function generate() {
    if (!img) return;
    var w = clampGrid(gwInput.value);
    var h = clampGrid(ghInput.value);
    gwInput.value = w;
    ghInput.value = h;
    var cells = Img.pixelateImage(img, w, h, imgCrop);
    setupPattern(Img.mapCellsToPattern(cells, CARD));
    genHint.textContent = '已生成 ' + w + '×' + h + ' 圖案，共 ' + pattern.demandList.length + ' 種顏色。';
  }

  function setupPattern(p) {
    pattern = p;
    inventory = Inventory.create(p.codes);
    board.setPattern(p.codes, null);
    board.bindBoard(inventory.board);
    box.clear();
    box.renderOnce();
    selectedCode = p.demandList.length ? p.demandList[0].code : null;
    buildPaletteList();
    updateStats();
    updateSelectedInfo();
    boardCanvas.style.display = 'block';
    boardPlaceholder.style.display = 'none';
    completeBanner.style.display = 'none';
  }

  // ---------- 色號清單（模組 2） ----------
  var rowRefs = {}; // code → {row, placedEl, remainEl}

  function buildPaletteList() {
    paletteList.innerHTML = '';
    rowRefs = {};
    if (!pattern) {
      paletteEmpty.style.display = 'block';
      return;
    }
    paletteEmpty.style.display = 'none';
    pattern.demandList.forEach(function (d) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'color-row' + (d.code === selectedCode ? ' active' : '');

      var sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = d.hex;

      var code = document.createElement('span');
      code.className = 'code';
      code.textContent = d.code;

      var name = document.createElement('span');
      name.className = 'cname';
      name.textContent = d.name;

      var nums = document.createElement('span');
      nums.className = 'nums';
      var demandEl = document.createElement('span');
      demandEl.className = 'n-demand';
      demandEl.textContent = '需 ' + d.demand;
      var placedEl = document.createElement('span');
      placedEl.className = 'n-placed';
      placedEl.textContent = '放 0';
      var remainEl = document.createElement('span');
      remainEl.className = 'n-remain';
      remainEl.textContent = '剩 ' + d.demand;
      nums.appendChild(demandEl);
      nums.appendChild(placedEl);
      nums.appendChild(remainEl);

      row.appendChild(sw);
      row.appendChild(code);
      row.appendChild(name);
      row.appendChild(nums);
      row.addEventListener('click', function () {
        selectedCode = d.code;
        refreshActiveRow();
        updateSelectedInfo();
      });
      paletteList.appendChild(row);
      rowRefs[d.code] = { row: row, placedEl: placedEl, remainEl: remainEl };
    });
  }

  function refreshActiveRow() {
    Object.keys(rowRefs).forEach(function (code) {
      rowRefs[code].row.classList.toggle('active', code === selectedCode);
    });
  }

  function updateStats() {
    if (!inventory) return;
    var stats = inventory.allStats();
    stats.forEach(function (s) {
      var ref = rowRefs[s.code];
      if (!ref) return;
      ref.placedEl.textContent = '放 ' + s.placed;
      ref.remainEl.textContent = '剩 ' + s.remaining;
      ref.row.classList.toggle('done', s.demand > 0 && s.remaining === 0);
    });
    var t = inventory.totals();
    progressFill.style.width = Math.min(100, t.percent) + '%';
    progressText.textContent = t.correctTotal + ' / ' + t.demandTotal + '（' + t.percent + '%）' +
      (t.wrongTotal > 0 ? ' · 異色 ' + t.wrongTotal : '');
    boxCount.textContent = '盒內 ' + box.liveCount() + ' / ' + box.maxLive + ' 顆';
    var done = inventory.isComplete();
    completeBanner.style.display = done ? 'block' : 'none';
    // 分頁徽章：顯示仍有剩餘需求的顏色數
    if (pattern) {
      var pending = stats.filter(function (s) { return s.remaining > 0; }).length;
      tabBadge.textContent = String(pending);
      tabBadge.hidden = pending === 0;
    } else {
      tabBadge.hidden = true;
    }
  }

  function updateSelectedInfo() {
    var c = selectedCode ? cardOf(selectedCode) : null;
    if (!c) {
      selectedInfo.innerHTML = '<span class="dim">尚未選擇色號</span>';
      return;
    }
    var s = inventory ? inventory.colorStats(c.code) : { demand: 0, placed: 0, remaining: 0 };
    selectedInfo.innerHTML =
      '<span class="swatch" style="background:' + c.hex + '"></span>' +
      '<span class="code">' + c.code + '</span>' +
      '<span class="dim">' + c.name + ' · 需 ' + s.demand + ' · 剩 ' + s.remaining + '</span>';
  }

  // ---------- 上傳 ----------
  var cropper = null;

  function handleFile(file) {
    if (!file) return;
    if (!file.type || file.type.indexOf('image/') !== 0) {
      genHint.textContent = '請上傳圖片檔案。';
      return;
    }
    Img.loadImageFromFile(file).then(function (loaded) {
      img = loaded;
      imgCrop = null;
      photoName.textContent = file.name;
      saveToLibrary(file);
      // 直接把整張圖畫到釘板，再用右上角「編輯」框選
      generate();
      boardTip.textContent = '已用整張圖生成；可用右上角「✎ 編輯」框選要保留的區域。';
    }).catch(function () {
      genHint.textContent = '圖片讀取失敗，請換一張。';
    });
  }

  // ---------- 圖片庫 ----------
  var Store = window.BeadImageStore;
  var libDrawer = null; // 稍後建立（需先有 createDrawer）
  var libListEl = $('libList');
  var libEmptyEl = $('libEmpty');
  var libCountEl = $('libCount');
  var libItems = [];      // [{id, name, size, createdAt, thumb}]
  var currentImageId = null;

  /** 將上傳的 File 存入圖片庫（初始不含裁切區域） */
  function saveToLibrary(file) {
    if (!Store || !Store.isSupported()) return Promise.resolve(null);
    return Store.add({
      name: file.name,
      blob: file,
      size: file.size,
      type: file.type,
      gridW: clampGrid(gwInput.value),
      gridH: clampGrid(ghInput.value),
      crop: null
    }).then(function (record) {
      currentImageId = record.id;
      return refreshLibrary().then(function () { return record; });
    }).catch(function () {
      genHint.textContent = '圖片已載入，但存入圖片庫失敗。';
      return null;
    });
  }

  /** 更新圖片庫中目前這筆記錄的裁切區域與網格尺寸 */
  function updateLibraryCrop() {
    if (!Store || !Store.isSupported() || !currentImageId) return Promise.resolve();
    return Store.get(currentImageId).then(function (rec) {
      if (!rec) return null;
      rec.crop = imgCrop ? {
        sx: imgCrop.sx, sy: imgCrop.sy, sw: imgCrop.sw, sh: imgCrop.sh
      } : null;
      rec.gridW = clampGrid(gwInput.value);
      rec.gridH = clampGrid(ghInput.value);
      return Store.put(rec);
    }).then(function () { return refreshLibrary(); }).catch(function () {});
  }

  function formatSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function formatTime(ts) {
    var d = new Date(ts);
    function p(n) { return String(n).padStart(2, '0'); }
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /** 重新讀取並渲染圖片庫 */
  function refreshLibrary() {
    if (!Store || !Store.isSupported()) {
      libEmptyEl.textContent = '此瀏覽器不支援圖片庫儲存（IndexedDB）。';
      libEmptyEl.classList.remove('hidden');
      return Promise.resolve();
    }
    return Store.listAll().then(function (records) {
      return Promise.all(records.map(function (rec) {
        return Store.blobToThumb(rec.blob, 96).then(function (thumb) {
          return {
            id: rec.id, name: rec.name, size: rec.size,
            createdAt: rec.createdAt, blob: rec.blob, thumb: thumb,
            hasCrop: !!(rec.crop && rec.crop.sw > 0)
          };
        }).catch(function () {
          return { id: rec.id, name: rec.name, size: rec.size, createdAt: rec.createdAt, blob: rec.blob, thumb: '', hasCrop: !!(rec.crop && rec.crop.sw > 0) };
        });
      }));
    }).then(function (items) {
      libItems = items;
      renderLibrary();
    }).catch(function () {
      libEmptyEl.textContent = '讀取圖片庫失敗。';
      libEmptyEl.classList.remove('hidden');
    });
  }

  function renderLibrary() {
    libListEl.innerHTML = '';
    libCountEl.textContent = '共 ' + libItems.length + ' 張';
    libEmptyEl.classList.toggle('hidden', libItems.length > 0);

    libItems.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'lib-item' + (item.id === currentImageId ? ' current' : '');
      row.setAttribute('data-id', item.id);

      var thumb = document.createElement('div');
      thumb.className = 'lib-thumb';
      thumb.title = '點擊載入這張圖片';
      if (item.thumb) {
        var im = document.createElement('img');
        im.src = item.thumb;
        im.alt = item.name;
        thumb.appendChild(im);
      }
      thumb.addEventListener('click', function () { loadFromLibrary(item.id); });

      var meta = document.createElement('div');
      meta.className = 'lib-meta';

      var nameEl = document.createElement('span');
      nameEl.className = 'lib-name';
      nameEl.textContent = item.name;
      nameEl.title = item.name;

      var sub = document.createElement('span');
      sub.className = 'lib-sub';
      sub.textContent = formatSize(item.size) + ' · ' + formatTime(item.createdAt) +
        (item.hasCrop ? ' · 已裁切' : '');

      var actions = document.createElement('div');
      actions.className = 'lib-actions';

      var loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'lib-btn load';
      loadBtn.textContent = '載入';
      loadBtn.addEventListener('click', function () { loadFromLibrary(item.id); });

      var copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'lib-btn';
      copyBtn.textContent = '複製';
      copyBtn.addEventListener('click', function () { duplicateLibraryItem(item.id); });

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'lib-btn del';
      delBtn.textContent = '刪除';
      delBtn.addEventListener('click', function () { deleteLibraryItem(item.id); });

      actions.appendChild(loadBtn);
      actions.appendChild(copyBtn);
      actions.appendChild(delBtn);

      meta.appendChild(nameEl);
      meta.appendChild(sub);
      meta.appendChild(actions);
      row.appendChild(thumb);
      row.appendChild(meta);
      libListEl.appendChild(row);
    });
  }

  /** 從圖片庫載入圖片（重新生成圖案） */
  function loadFromLibrary(id) {
    if (!Store) return;
    Store.get(id).then(function (rec) {
      if (!rec) return;
      return Store.blobToImage(rec.blob).then(function (loaded) {
        img = loaded;
        currentImageId = rec.id;
        photoName.textContent = rec.name;
        if (rec.gridW) gwInput.value = rec.gridW;
        if (rec.gridH) ghInput.value = rec.gridH;
        // 還原當初選定的裁切區域（沒有則用整張圖）
        if (rec.crop && rec.crop.sw > 0 && rec.crop.sh > 0) {
          imgCrop = {
            sx: rec.crop.sx, sy: rec.crop.sy,
            sw: rec.crop.sw, sh: rec.crop.sh
          };
        } else {
          imgCrop = null;
        }
        generate();
        renderLibrary();
        boardTip.textContent = '已從圖片庫載入「' + rec.name + '」' +
          (imgCrop ? '（包含裁切區域）' : '') + '。';
      });
    }).catch(function () {
      boardTip.textContent = '載入圖片失敗。';
    });
  }

  /** 複製為新項目 */
  function duplicateLibraryItem(id) {
    if (!Store) return;
    Store.get(id).then(function (rec) {
      if (!rec) return null;
      var dot = rec.name.lastIndexOf('.');
      var base = dot > 0 ? rec.name.slice(0, dot) : rec.name;
      var ext = dot > 0 ? rec.name.slice(dot) : '';
      return Store.add({
        name: base + '(複本)' + ext,
        blob: rec.blob,
        size: rec.size,
        type: rec.type,
        gridW: rec.gridW,
        gridH: rec.gridH,
        crop: rec.crop || null
      });
    }).then(function (created) {
      if (!created) return;
      return refreshLibrary().then(function () {
        boardTip.textContent = '已複製「' + created.name + '」。';
      });
    }).catch(function () {
      boardTip.textContent = '複製失敗。';
    });
  }

  /** 刪除項目 */
  function deleteLibraryItem(id) {
    if (!Store) return;
    Store.remove(id).then(function () {
      if (currentImageId === id) currentImageId = null;
      return refreshLibrary().then(function () {
        boardTip.textContent = '已刪除 1 張圖片。';
      });
    }).catch(function () {
      boardTip.textContent = '刪除失敗。';
    });
  }

  $('libClearAll').addEventListener('click', function () {
    if (!Store || libItems.length === 0) return;
    if (!window.confirm('確定要清空圖片庫中的 ' + libItems.length + ' 張圖片嗎？')) return;
    Store.clearAll().then(function () {
      currentImageId = null;
      return refreshLibrary();
    }).then(function () {
      boardTip.textContent = '圖片庫已清空。';
    });
  });

  photoDrop.addEventListener('dragover', function (e) { e.preventDefault(); photoDrop.classList.add('drag'); });
  photoDrop.addEventListener('dragleave', function () { photoDrop.classList.remove('drag'); });
  photoDrop.addEventListener('drop', function (e) {
    e.preventDefault();
    photoDrop.classList.remove('drag');
    handleFile(e.dataTransfer.files[0]);
  });
  photoDrop.addEventListener('click', function () { photoInput.click(); });
  photoInput.addEventListener('change', function (e) { handleFile(e.target.files[0]); });

  demoBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    img = null;
    photoName.textContent = '內建示範：32×32 愛心';
    setupPattern(Img.mapCellsToPattern(Img.makeDemoCells(32), CARD));
    genHint.textContent = '已載入示範圖案（32×32），可直接體驗取豆與拼豆。';
  });

  // ---------- 釘板編輯模式（直接在釘板上框選要保留的格子） ----------
  var boardEditBtn = $('boardEditBtn');
  var cropToolbar = $('cropToolbar');
  var cropSelInfo = $('cropSelInfo');
  var cropApplyBtn = $('cropApplyBtn');
  var cropCancelBtn = $('cropCancelBtn');
  var boardEditHint = $('boardEditHint');
  var lastGridW = 0, lastGridH = 0;   // 框選前的網格尺寸（用於換算裁切座標）

  function setBoardEditMode(on) {
    if (on && !pattern) {
      boardTip.textContent = '請先上傳圖片或使用示範圖案。';
      return;
    }
    if (on && pattern) {
      // 記下框選前的網格尺寸，供換算裁切座標
      lastGridW = pattern.width;
      lastGridH = pattern.height;
    }
    board.setEditMode(on);
    boardEditBtn.classList.toggle('active', on);
    boardEditBtn.textContent = on ? '✕ 結束編輯' : '✎ 編輯';
    cropToolbar.hidden = !on;
    boardEditHint.hidden = !on;
    if (on) {
      // 預設選取全部
      board.setSelectionRect(0, 0, pattern.width - 1, pattern.height - 1);
      updateCropSelInfo();
    }
  }

  function updateCropSelInfo() {
    var sel = board.getSelection();
    if (!sel) {
      cropSelInfo.textContent = '尚未選取';
      cropApplyBtn.disabled = true;
      return;
    }
    cropSelInfo.textContent = sel.w + '×' + sel.h + ' 格（第' + (sel.y0 + 1) + '行、第' + (sel.x0 + 1) + '列起）';
    cropApplyBtn.disabled = false;
  }

  board.setSelectionChangeHandler(function () { updateCropSelInfo(); });

  boardEditBtn.addEventListener('click', function () {
    setBoardEditMode(!board.isEditMode());
  });

  cropCancelBtn.addEventListener('click', function () {
    setBoardEditMode(false);
    boardTip.textContent = '已取消框選。';
  });

  cropApplyBtn.addEventListener('click', function () {
    var sel = board.getSelection();
    if (!sel || !pattern || !img) {
      setBoardEditMode(false);
      return;
    }
    // 將選取格子範圍換算回原圖像素座標
    var sx = (sel.x0 / pattern.width) * img.width;
    var sy = (sel.y0 / pattern.height) * img.height;
    var sw = (sel.w / pattern.width) * img.width;
    var sh = (sel.h / pattern.height) * img.height;

    imgCrop = { sx: sx, sy: sy, sw: sw, sh: sh };
    gwInput.value = sel.w;
    ghInput.value = sel.h;
    imgCrop = null;   // 先清空再生成，避免舊裁切影響

    // 用裁切後的圖重新生成 sel.w × sel.h
    var cells = Img.pixelateImage(img, sel.w, sel.h, { sx: sx, sy: sy, sw: sw, sh: sh });
    setupPattern(Img.mapCellsToPattern(cells, CARD));
    genHint.textContent = '已框選 ' + sel.w + '×' + sel.h + ' 格並重新生成。';
    setBoardEditMode(false);
    updateLibraryCropForRange(sel);
    boardTip.textContent = '已套用框選：' + sel.w + '×' + sel.h + ' 格。';
  });

  /** 將目前釘板的框選結果記到圖片庫（供載入時還原） */
  function updateLibraryCropForRange(sel) {
    if (!window.BeadImageStore || !currentImageId || !img) return;
    var Store = window.BeadImageStore;
    // 以「整張圖 ↔ 網格」的比例換算回原圖像素座標
    var totalW = parseInt(gwInput.value, 10) || sel.w;
    var totalH = parseInt(ghInput.value, 10) || sel.h;
    // 注意：sel 是在「上一輪生成的網格」上選的，因此用當時的 grid 比例
    var srcW = lastGridW || totalW;
    var srcH = lastGridH || totalH;
    var sx = (sel.x0 / srcW) * img.width;
    var sy = (sel.y0 / srcH) * img.height;
    var sw = (sel.w / srcW) * img.width;
    var sh = (sel.h / srcH) * img.height;

    Store.get(currentImageId).then(function (rec) {
      if (!rec) return null;
      rec.crop = { sx: sx, sy: sy, sw: sw, sh: sh };
      rec.gridW = sel.w;
      rec.gridH = sel.h;
      return Store.put(rec);
    }).then(function () { return refreshLibrary(); }).catch(function () {});
  }

  // ---------- 裁切器（保留舊彈窗元件，不再自動觸發） ----------
  cropper = window.BeadCropper.create({
    modal: $('cropModal'),
    canvas: $('cropCanvas'),
    previewCanvas: $('cropPreview'),
    infoEl: $('cropInfo'),
    confirmBtn: $('cropConfirm'),
    resetBtn: $('cropReset'),
    skipBtn: $('cropSkip'),
    cancelBtn: $('cropCancel'),
    getGridW: function () { return clampGrid(gwInput.value); },
    getGridH: function () { return clampGrid(ghInput.value); },
    onConfirm: function (rect) {
      imgCrop = rect;
      generate();
      updateLibraryCrop();
      boardTip.textContent = '已依選定區域生成圖案（已存入圖片庫）。';
    },
    onSkip: function () {
      imgCrop = null;
      generate();
      updateLibraryCrop();
      boardTip.textContent = '已用整張圖片生成圖案（已存入圖片庫）。';
    }
  });

  // 尺寸預設
  CFG.GRID.PRESETS.forEach(function (n) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = n + '×' + n;
    b.addEventListener('click', function () {
      gwInput.value = n;
      ghInput.value = n;
      if (img) generate();
    });
    presetsEl.appendChild(b);
  });
  applyBtn.addEventListener('click', generate);
  gwInput.addEventListener('change', function () {
    if (cropper && cropper.isOpen()) { cropper.refresh(); return; }
    if (img) generate();
  });
  ghInput.addEventListener('change', function () {
    if (cropper && cropper.isOpen()) { cropper.refresh(); return; }
    if (img) generate();
  });

  // ---------- 清單匯出 ----------
  exportBtn.addEventListener('click', function () {
    if (!pattern) return;
    var t = inventory.totals();
    var payload = {
      size: { width: pattern.width, height: pattern.height },
      progress: t,
      colors: pattern.demandList.map(function (d) {
        var s = inventory.colorStats(d.code);
        return { code: d.code, name: d.name, hex: d.hex, demand: s.demand, placed: s.placed, remaining: s.remaining };
      })
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'bead-shopping-list.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // ---------- 豆盒操作 ----------
  pourBtn.addEventListener('click', function () {
    if (!selectedCode) return;
    var c = cardOf(selectedCode);
    var added = box.pour(c.code, c.hex, CFG.PHYSICS.POUR_BATCH);
    if (added === 0) {
      boardTip.textContent = '豆盒已滿（上限 ' + box.maxLive + ' 顆），請先取豆再倒。';
    } else {
      boardTip.textContent = '已倒入 ' + added + ' 顆 ' + c.code + '。從豆盒抓豆拖到釘板放置。';
    }
    updateStats();
    // 豆子變多 → 浮窗最小尺寸跟著長大
    if (isBoxFloating()) updateFloatMinSize();
  });
  shakeBtn.addEventListener('click', box.shake);
  clearBoxBtn.addEventListener('click', function () {
    box.clear();
    updateStats();
  });

  ghostToggle.addEventListener('change', function () {
    board.setGhost(ghostToggle.checked);
  });

  // ---------- 釘板縮放 / 平移 ----------
  var zoomSlider = $('zoomSlider');
  var zoomVal = $('zoomVal');
  var ZOOM_WHEEL = CFG.BOARD.ZOOM_WHEEL;
  var ZOOM_STEP = CFG.BOARD.ZOOM_STEP;

  function syncZoomUI() {
    var s = board.getScale();
    zoomSlider.value = Math.max(+zoomSlider.min, Math.min(+zoomSlider.max, s));
    zoomVal.textContent = s.toFixed(s >= 1 ? 1 : 2) + '×';
  }

  zoomSlider.addEventListener('input', function () {
    board.setZoom(+zoomSlider.value);
    syncZoomUI();
  });
  $('zoomIn').addEventListener('click', function () {
    board.setZoom(board.getScale() + ZOOM_STEP);
    syncZoomUI();
  });
  $('zoomOut').addEventListener('click', function () {
    board.setZoom(board.getScale() - ZOOM_STEP);
    syncZoomUI();
  });
  $('zoomFit').addEventListener('click', function () {
    board.resetFit();
    syncZoomUI();
  });

  // 滾輪縮放（以游標為錨點）
  boardCanvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var factor = e.deltaY < 0 ? ZOOM_WHEEL : 1 / ZOOM_WHEEL;
    board.zoomAt(e.clientX, e.clientY, factor);
    syncZoomUI();
  }, { passive: false });

  // 視窗/容器尺寸變化時同步倍率顯示
  window.addEventListener('resize', function () { setTimeout(syncZoomUI, 0); });
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(function () { syncZoomUI(); }).observe(document.querySelector('.board-wrap'));
  }

  // 釘板拖曳平移 vs 點擊收回（位移 >5px 為平移）
  var boardDragStart = null;
  var boardPanStart = null;
  var BOARD_DRAG_THRESHOLD = 5;

  boardCanvas.addEventListener('pointerdown', function (e) {
    if (!inventory) return;
    if (board.isEditMode()) return;   // 編集模式下交由 board.js 處理框選
    boardDragStart = { x: e.clientX, y: e.clientY };
    boardPanStart = board.getPan();
    try { boardCanvas.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });

  boardCanvas.addEventListener('pointermove', function (e) {
    if (!boardDragStart) return;
    var dx = e.clientX - boardDragStart.x;
    var dy = e.clientY - boardDragStart.y;
    if (Math.abs(dx) > BOARD_DRAG_THRESHOLD || Math.abs(dy) > BOARD_DRAG_THRESHOLD) {
      // 平移模式
      board.setPan(boardPanStart.x + dx, boardPanStart.y + dy);
    }
  });

  boardCanvas.addEventListener('pointerup', function (e) {
    if (!boardDragStart) return;    var dx = e.clientX - boardDragStart.x;
    var dy = e.clientY - boardDragStart.y;
    var wasDrag = Math.abs(dx) > BOARD_DRAG_THRESHOLD || Math.abs(dy) > BOARD_DRAG_THRESHOLD;
    boardDragStart = null;
    boardPanStart = null;
    try { boardCanvas.releasePointerCapture(e.pointerId); } catch (err) {}
    if (!wasDrag && inventory) {
      // 點擊模式：收回豆子
      var cellPos = board.cellFromClient(e.clientX, e.clientY);
      if (cellPos) {
        var removed = inventory.remove(cellPos.x, cellPos.y);
        if (removed !== null) {
          board.render();
          updateStats();
          updateSelectedInfo();
          boardTip.textContent = '已收回 1 顆 ' + removed + '（第 ' + (cellPos.y + 1) + ' 行第 ' + (cellPos.x + 1) + ' 列）。';
        }
      }
    }
  });

  // ---------- 拖豆：豆盒 → 釘板 ----------
  function canvasPoint(canvasEl, clientX, clientY) {
    var rect = canvasEl.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width * canvasEl.width,
      y: (clientY - rect.top) / rect.height * canvasEl.height,
      inside: clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
    };
  }

  function showDragGhost(hex, clientX, clientY) {
    dragGhost.style.display = 'block';
    dragGhost.style.background = hex;
    dragGhost.style.left = (clientX - 14) + 'px';
    dragGhost.style.top = (clientY - 14) + 'px';
  }
  function hideDragGhost() { dragGhost.style.display = 'none'; }

  boxCanvas.addEventListener('pointerdown', function (e) {
    if (!inventory) return;
    var p = canvasPoint(boxCanvas, e.clientX, e.clientY);
    var body = box.beadAtPoint(p.x, p.y);
    if (!body) return;
    draggingBody = body;
    draggingBody.__outside = false;
    dragLastInBox = { x: body.position.x, y: body.position.y };
    Matter.Body.setVelocity(body, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(body, 0);
    Matter.Body.setStatic(body, true);
    Matter.Sleeping.set(body, false);
    try { boxCanvas.setPointerCapture(e.pointerId); } catch (err) {}
    showDragGhost(body.plugin.hex, e.clientX, e.clientY);
    e.preventDefault();
  });

  window.addEventListener('pointermove', function (e) {
    if (!draggingBody) return;
    var p = canvasPoint(boxCanvas, e.clientX, e.clientY);
    showDragGhost(draggingBody.plugin.hex, e.clientX, e.clientY);
    if (p.inside) {
      draggingBody.__outside = false;
      dragLastInBox = {
        x: Math.max(box.radius, Math.min(box.width - box.radius, p.x)),
        y: Math.max(box.radius, Math.min(box.height - box.radius, p.y))
      };
      Matter.Body.setPosition(draggingBody, dragLastInBox);
      board.setHover(null);
    } else {
      draggingBody.__outside = true;
      var cellPos = board.cellFromClient(e.clientX, e.clientY);
      board.setHover(cellPos);
    }
  });

  window.addEventListener('pointerup', function (e) {
    if (!draggingBody) return;
    var body = draggingBody;
    draggingBody = null;
    hideDragGhost();
    board.setHover(null);

    var cellPos = board.cellFromClient(e.clientX, e.clientY);
    if (cellPos && inventory.beadAt(cellPos.x, cellPos.y) === null) {
      // 吸附放置
      var result = inventory.place(cellPos.x, cellPos.y, body.plugin.code);
      if (result) {
        box.removeBead(body);
        if (!result.correct) board.flashWrong(cellPos.x, cellPos.y);
        board.render();
        updateStats();
        updateSelectedInfo();
        return;
      }
    }
    // 駁回：回盒
    var back = cellPos ? dragLastInBox : dragLastInBox; // 統一回最後盒內位置
    Matter.Body.setStatic(body, false);
    Matter.Body.setPosition(body, back || { x: box.width / 2, y: box.radius + 4 });
    Matter.Body.setVelocity(body, { x: (Math.random() - 0.5) * 3, y: 0 });
    body.__outside = false;
  });

  // ---------- 釘板：點豆收回（已由上方 pointerup 處理） ----------

  // ---------- 主題切換 ----------
  $('themeToggle').addEventListener('click', function () {
    window.BeadBackground.toggle();
  });

  // ---------- 除錯接口（供自動化測試/手動檢查） ----------
  window.__beadApp = {
    get board() { return board; },
    get inventory() { return inventory; },
    get box() { return box; },
    get pattern() { return pattern; },
    get selectedCode() { return selectedCode; }
  };

  // 初始化：豆盒 canvas 預設在抽屜槽內
  boxSlot.appendChild(boxWrapEl);
  scheduleSyncBoxSize();
  box.renderOnce();

  // 初始化：載入圖片庫
  refreshLibrary();

  // ---------- 啟動 ----------
  window.BeadBackground.init();
  box.start();
  box.renderOnce();
  updateSelectedInfo();
})();
