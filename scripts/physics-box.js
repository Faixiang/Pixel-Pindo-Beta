/**
 * 物理豆盒（Matter.js）：重力、碰撞、堆疊、滑鼠抓豆、翻動、倒豆。
 * 支援 resize(w, h) 動態調整盒內世界尺寸（牆體重建、豆子夾回盒內）。
 * 僅在瀏覽器使用（依賴全域 Matter）。
 * 掛到 window.BeadPhysicsBox。
 */
(function (root, factory) {
  root.BeadPhysicsBox = factory(root);
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
  'use strict';

  function create(canvas, opts) {
    var CFG = root.BeadConfig.PHYSICS;
    opts = opts || {};

    var W = opts.width || CFG.WIDTH;
    var H = opts.height || CFG.HEIGHT;
    var R = CFG.BEAD_RADIUS;
    var WALL = 60;

    var ctx = canvas.getContext('2d');

    var engine = Matter.Engine.create({ enableSleeping: true });
    engine.gravity.y = CFG.GRAVITY_Y;
    // 提高求解器迭代次數，減少穿透與抖動
    if (engine.positionIterations !== undefined) engine.positionIterations = CFG.POSITION_ITERATIONS;
    if (engine.velocityIterations !== undefined) engine.velocityIterations = CFG.VELOCITY_ITERATIONS;
    if (engine.constraintIterations !== undefined) engine.constraintIterations = 2;

    var world = engine.world;

    var wallBodies = [];

    function applyCanvasSize() {
      canvas.width = W;
      canvas.height = H;
    }

    applyCanvasSize();
    buildWalls();

    var beads = []; // Matter.Body，plugin: {code, hex}

    function liveCount() { return beads.length; }

    function shade(hex, amt) {
      var c = root.BeadColor.hexToRgb(hex) || { r: 128, g: 128, b: 128 };
      function f(v) { return Math.max(0, Math.min(255, Math.round(v + amt))); }
      return 'rgb(' + f(c.r) + ',' + f(c.g) + ',' + f(c.b) + ')';
    }

    /** 把豆子位置夾回盒內（避免 resize 後卡在牆外或被牆彈出） */
    function clampBodyInside(body) {
      var margin = R + 2;
      var x = Math.max(margin, Math.min(W - margin, body.position.x));
      var y = Math.max(margin, Math.min(H - margin, body.position.y));
      if (x !== body.position.x || y !== body.position.y) {
        Matter.Body.setPosition(body, { x: x, y: y });
      }
      // 清掉殘留速度，避免下一幀穿牆
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
      Matter.Body.setAngularVelocity(body, 0);
    }

    /** 強制將所有豆子夾回盒内（供外部 resize 後呼叫） */
    function clampAll() {
      beads.forEach(function (b) {
        Matter.Sleeping.set(b, false);
        clampBodyInside(b);
      });
      return beads.length;
    }

    /** 依目前 W/H 建立四面牆（左右底 + 隱形頂蓋防彈出） */
    function buildWalls() {
      wallBodies.forEach(function (b) { Matter.Composite.remove(world, b); });
      // 牆壁加厚且緊貼邊界，減少穿透
      var T = Math.max(WALL, R * 4);
      wallBodies = [
        Matter.Bodies.rectangle(W / 2, H + T / 2, W + T * 2, T, {
          isStatic: true, label: 'wall-bottom', friction: 0.6, restitution: 0
        }),
        Matter.Bodies.rectangle(-T / 2, H / 2, T, H * 4, {
          isStatic: true, label: 'wall-left', friction: 0.4, restitution: 0
        }),
        Matter.Bodies.rectangle(W + T / 2, H / 2, T, H * 4, {
          isStatic: true, label: 'wall-right', friction: 0.4, restitution: 0
        }),
        Matter.Bodies.rectangle(W / 2, -T, W + T * 2, T, {
          isStatic: true, label: 'wall-top', restitution: 0
        })
      ];
      Matter.Composite.add(world, wallBodies);
    }

    function addBead(code, hex, x, y) {
      var body = Matter.Bodies.circle(
        x === undefined ? R + Math.random() * (W - R * 2) : x,
        y === undefined ? R + Math.random() * 40 : y,
        R,
        {
          friction: CFG.FRICTION,
          frictionStatic: CFG.FRICTION_STATIC,
          restitution: CFG.RESTITUTION,
          frictionAir: CFG.AIR_FRICTION,
          density: 0.0012,
          slop: 0.02,
          label: 'bead'
        }
      );
      body.plugin = { code: code, hex: hex };
      Matter.Composite.add(world, body);
      beads.push(body);
      return body;
    }

    /** 倒豆：批次從盒頂落入；回傳實際倒入數 */
    function pour(code, hex, count) {
      var room = CFG.MAX_LIVE_BEADS - beads.length;
      var n = Math.max(0, Math.min(count || CFG.POUR_BATCH, room));
      var usableW = Math.max(R * 2, W - R * 2);
      for (var i = 0; i < n; i++) {
        var x = R + Math.random() * usableW;
        // 從盒頂內縮 R*1.2 起，避免生成在牆內或頂蓋外
        var y = R * 1.2 + (i % 5) * (R * 2.2) + Math.random() * 6;
        var b = addBead(code, hex, x, y);
        Matter.Body.setVelocity(b, { x: (Math.random() - 0.5) * 3, y: Math.random() * 1.5 });
      }
      return n;
    }

    /** 翻動：給所有豆一個向上/側向的隨機速度 */
    function shake() {
      beads.forEach(function (b) {
        Matter.Sleeping.set(b, false);
        Matter.Body.setVelocity(b, {
          x: b.velocity.x + (Math.random() - 0.5) * 7,
          y: b.velocity.y - (2.5 + Math.random() * 5)
        });
      });
    }

    function removeBead(body) {
      var i = beads.indexOf(body);
      if (i >= 0) beads.splice(i, 1);
      Matter.Composite.remove(world, body);
    }

    function clear() {
      while (beads.length) removeBead(beads[0]);
    }

    /** 依 canvas 內座標找最上方的豆 */
    function beadAtPoint(px, py) {
      var found = null;
      for (var i = beads.length - 1; i >= 0; i--) {
        var b = beads[i];
        var dx = px - b.position.x;
        var dy = py - b.position.y;
        if (dx * dx + dy * dy <= R * R * 1.2) { found = b; break; }
      }
      return found;
    }

    function drawBead(b) {
      var x = b.position.x;
      var y = b.position.y;
      var hex = b.plugin.hex;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(b.angle);
      // 陰影
      ctx.beginPath();
      ctx.arc(1.8, 3, R, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fill();
      // 本體
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fillStyle = hex;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = shade(hex, -50);
      ctx.stroke();
      // 高光
      ctx.beginPath();
      ctx.arc(-R * 0.32, -R * 0.36, R * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fill();
      // 中心孔（拼豆是中空圓筒）
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = shade(hex, -38);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.stroke();
      ctx.restore();
    }

    function render(skipBody) {
      ctx.clearRect(0, 0, W, H);
      // 盒底陰影
      var grad = ctx.createLinearGradient(0, H - 30, 0, H);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, H - 30, W, 30);
      for (var i = 0; i < beads.length; i++) {
        if (beads[i] !== skipBody) drawBead(beads[i]);
      }
    }

    /**
     * 調整盒內世界尺寸：先夾回豆子、再重建牆體、再夾一次，避免被新牆彈出。
     * 回傳是否實際變更。
     */
    function resize(newW, newH) {
      newW = Math.max(R * 4, Math.round(newW || W));
      newH = Math.max(R * 6, Math.round(newH || H));
      if (newW === W && newH === H) return false;

      // 1) 先依新尺寸夾回豆子（此時舊牆仍在，避免豆子被推出）
      beads.forEach(function (b) {
        Matter.Sleeping.set(b, false);
        Matter.Body.setStatic(b, true);
      });

      W = newW;
      H = newH;
      applyCanvasSize();

      // 2) 夾回 + 重建牆體
      beads.forEach(clampBodyInside);
      buildWalls();
      // 3) 再次夾回（牆體建立後確認）
      beads.forEach(clampBodyInside);

      beads.forEach(function (b) { Matter.Body.setStatic(b, false); });
      render(null);
      return true;
    }

    // 固定步長主迴圈
    var running = false;
    var rafId = 0;
    var getDragging = null; // 由外部設定：回傳目前被拖曳的 body（可能已移出盒外）
    function tick() {
      if (!running) return;
      Matter.Engine.update(engine, CFG.FIXED_DT);
      // 兜底：任何越界或速度異常的豆子立即修正（防止穿牆掉出視野）
      for (var i = 0; i < beads.length; i++) {
        var b = beads[i];
        if (b === (getDragging && getDragging())) continue;
        var p = b.position;
        if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) {
          Matter.Sleeping.set(b, false);
          clampBodyInside(b);
        }
      }
      var dragging = getDragging ? getDragging() : null;
      render(dragging && dragging.__outside ? dragging : null);
      rafId = requestAnimationFrame(tick);
    }

    return {
      canvas: canvas,
      world: world,
      get width() { return W; },
      get height() { return H; },
      radius: R,
      addBead: addBead,
      pour: pour,
      shake: shake,
      removeBead: removeBead,
      clear: clear,
      clampAll: clampAll,
      liveCount: liveCount,
      beadAtPoint: beadAtPoint,
      maxLive: CFG.MAX_LIVE_BEADS,
      resize: resize,
      /** 外部註冊拖曳狀態提供者（body 或 null；body.__outside 表已拖出盒外） */
      setDraggingProvider: function (fn) { getDragging = fn; },
      start: function () { if (!running) { running = true; tick(); } },
      stop: function () { running = false; cancelAnimationFrame(rafId); },
      /** 立即重繪一格畫面（初始化用） */
      renderOnce: function () { render(null); }
    };
  }

  return { create: create };
});
