/* TechText — vanilla JS port of the React Bits "TechText" canvas wordmark.
   Same engine and settings as the pasted snippet (reveal="letter", dashed
   outlines, specks, selection frame, labels, draggable letters, idle sweep).
   Framework-free: call window.initTechText(container, canvas, options).
   Text default here is "RUDRA" (pass { text } to override). */
(function () {
  'use strict';

  var LABEL_FONT = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  var FALLOFF_STEPS = 8;
  var SPRING = 320;
  var DAMPING = 22;

  var approach = function (current, target, dt, seconds) {
    return current + (target - current) * (1 - Math.exp(-dt / seconds));
  };

  var hexToRgb = function (hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.replace(/./g, function (c) { return c + c; });
    var n = parseInt(h.slice(0, 6), 16);
    return Number.isNaN(n) ? [255, 255, 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  var rgba = function (hex, alpha) {
    var c = hexToRgb(hex);
    return 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + alpha + ')';
  };

  var noise = function () {
    var h = 2166136261;
    for (var vi = 0; vi < arguments.length; vi++) {
      var value = arguments[vi];
      h = Math.imul(h ^ (value | 0), 16777619);
      h ^= h >>> 13;
      h = Math.imul(h, 0x5bd1e995);
      h ^= h >>> 15;
    }
    return (h >>> 0) / 4294967296;
  };

  var signed = function (value) {
    return value > 0 ? '+' + value : value < 0 ? '\u2212' + -value : '0';
  };

  window.initTechText = function (container, canvas, options) {
    var defaults = {
      text: 'RUDRA',
      fontFamily: '',
      fontWeight: 800,
      fontSize: 150,
      letterSpacing: -0.05,
      color: '#f7f7f5',
      accentColor: '#f7f7f5',
      reach: 200,
      softness: 0.7,
      dashLength: 4,
      dashGap: 2,
      strokeWidth: 1.5,
      lineStyle: 'dashed',
      reveal: 'letter',
      specks: 15,
      selection: true,
      labels: true,
      draggable: true,
      sweep: true,
      speed: 1
    };
    var settings = {};
    var k;
    for (k in defaults) settings[k] = defaults[k];
    if (options) for (k in options) settings[k] = options[k];

    var ctx = canvas ? canvas.getContext('2d') : null;
    var scratch = document.createElement('canvas');
    var scratchCtx = scratch.getContext('2d');
    if (!container || !canvas || !ctx || !scratchCtx) return function () {};

    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var width = 1;
    var height = 1;
    var dpr = 1;
    var raf = 0;
    var last = performance.now();
    var visible = true;
    var alive = true;
    var layoutKey = '';
    var requestedFont = '';
    var word = null;
    var glyphs = [];
    var presence = 0;
    var clock = 0;
    var pulse = 0;
    var placed = false;
    var dragging = -1;
    var wakeFn = function () {};
    var pointer = { x: 0, y: 0, inside: false };
    var grab = { x: 0, y: 0 };
    var lens = { x: 0, y: 0 };
    var frame = { x1: 0, y1: 0, x2: 0, y2: 0, alpha: 0, index: -1 };

    var refreshFonts = function () {
      layoutKey = '';
      wakeFn();
    };

    var family = function (s) {
      return s.fontFamily || getComputedStyle(container).fontFamily || 'sans-serif';
    };
    var fontFor = function (s, size) {
      return s.fontWeight + ' ' + size + 'px ' + family(s);
    };

    var setFont = function (target, s, size) {
      target.font = fontFor(s, size);
      if ('letterSpacing' in target) target.letterSpacing = (s.letterSpacing * size) + 'px';
      target.textAlign = 'left';
      target.textBaseline = 'alphabetic';
    };

    var sprite = function (s, view, glyph, stroke) {
      var pad = Math.ceil(s.strokeWidth * 2 + 4);
      var left = glyph.box.x1 - pad;
      var top = glyph.box.y1 - pad;
      var w = glyph.box.x2 - glyph.box.x1 + pad * 2;
      var h = glyph.box.y2 - glyph.box.y1 + pad * 2;
      var image = document.createElement('canvas');
      image.width = Math.max(1, Math.ceil(w * dpr));
      image.height = Math.max(1, Math.ceil(h * dpr));
      var c = image.getContext('2d');
      if (!c) return { image: image, left: left, top: top };
      c.setTransform(dpr, 0, 0, dpr, -left * dpr, -top * dpr);
      setFont(c, s, view.size);
      if (stroke) {
        c.lineJoin = 'round';
        c.lineWidth = s.strokeWidth * 2;
        c.lineCap = 'butt';
        c.strokeStyle = s.color;
        if (s.lineStyle !== 'solid') c.setLineDash([Math.max(1, s.dashLength), Math.max(1, s.dashGap)]);
        c.strokeText(glyph.char, glyph.x, view.baseline);
        c.setLineDash([]);
        c.globalCompositeOperation = 'destination-out';
        c.fillStyle = '#000000';
        c.fillText(glyph.char, glyph.x, view.baseline);
        c.globalCompositeOperation = 'source-over';
      } else {
        c.fillStyle = s.color;
        c.fillText(glyph.char, glyph.x, view.baseline);
      }
      return { image: image, left: left, top: top };
    };

    var ensureLayout = function (s) {
      var key = [
        s.text, family(s), s.fontWeight, s.fontSize, s.letterSpacing,
        s.color, s.dashLength, s.dashGap, s.strokeWidth, s.lineStyle,
        width, height, dpr
      ].join('|');
      if (key === layoutKey && word) return word;
      layoutKey = key;
      var wanted = fontFor(s, 64);
      if (document.fonts && wanted !== requestedFont) {
        requestedFont = wanted;
        document.fonts.load(wanted, s.text).then(refreshFonts, refreshFonts);
      }

      var probe = scratchCtx;
      setFont(probe, s, s.fontSize);
      var m = probe.measureText(s.text);
      var fit = Math.min(
        1,
        (width * 0.9) / Math.max(m.actualBoundingBoxLeft + m.actualBoundingBoxRight, 1),
        (height * 0.66) / Math.max(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, 1)
      );
      var size = s.fontSize * fit;
      setFont(probe, s, size);
      m = probe.measureText(s.text);
      var inkWidth = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
      var inkHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      var x = (width - inkWidth) / 2 + m.actualBoundingBoxLeft;
      var baseline = (height - inkHeight) / 2 + m.actualBoundingBoxAscent;
      var next = {
        size: size,
        baseline: baseline,
        left: x - m.actualBoundingBoxLeft,
        right: x + m.actualBoundingBoxRight,
        top: baseline - m.actualBoundingBoxAscent,
        bottom: baseline + m.actualBoundingBoxDescent
      };
      word = next;

      var chars = Array.from(s.text);
      var previous = glyphs;
      glyphs = [];
      var prefix = '';
      chars.forEach(function (char, i) {
        prefix += char;
        var own = probe.measureText(char);
        var gx = x + probe.measureText(prefix).width - own.width;
        if (!char.trim()) return;
        var base = {
          char: char,
          x: gx,
          box: {
            x1: gx - own.actualBoundingBoxLeft,
            y1: baseline - own.actualBoundingBoxAscent,
            x2: gx + own.actualBoundingBoxRight,
            y2: baseline + own.actualBoundingBoxDescent
          }
        };
        var kept = previous[glyphs.length];
        glyphs.push({
          char: base.char,
          x: base.x,
          box: base.box,
          offset: kept && kept.char === char ? kept.offset : { x: 0, y: 0 },
          velocity: { x: 0, y: 0 },
          outline: 0,
          index: i,
          fill: sprite(s, next, base, false),
          dashes: sprite(s, next, base, true)
        });
      });
      dragging = -1;
      frame.index = -1;
      return next;
    };

    var glyphAt = function (px, py) {
      if (!word || py < word.top - 24 || py > word.bottom + 24) return -1;
      var best = -1;
      var bestDistance = Infinity;
      glyphs.forEach(function (glyph, i) {
        var x1 = glyph.box.x1 + glyph.offset.x;
        var x2 = glyph.box.x2 + glyph.offset.x;
        var d = px < x1 ? x1 - px : px > x2 ? px - x2 : 0;
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      });
      return bestDistance < 28 ? best : -1;
    };

    var falloff = function (target, cx, cy, radius, strength, softness) {
      var inner = Math.min(1, Math.max(0, 1 - softness));
      var gradient = target.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, 'rgba(0, 0, 0, ' + strength + ')');
      var i, t, eased;
      if (inner > 0.995) {
        gradient.addColorStop(0.995, 'rgba(0, 0, 0, ' + strength + ')');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        return gradient;
      }
      for (i = 0; i <= FALLOFF_STEPS; i++) {
        t = i / FALLOFF_STEPS;
        eased = t * t * (3 - 2 * t);
        gradient.addColorStop(inner + (1 - inner) * t, 'rgba(0, 0, 0, ' + (strength * (1 - eased)) + ')');
      }
      return gradient;
    };

    var blit = function (target, art, dx, dy, originX, originY) {
      target.drawImage(
        art.image,
        Math.round((art.left + dx) * dpr - originX),
        Math.round((art.top + dy) * dpr - originY)
      );
    };

    var drawReveal = function (s) {
      var radius = s.reach * dpr;
      var cx = lens.x * dpr;
      var cy = lens.y * dpr;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = falloff(ctx, cx, cy, radius, presence, s.softness);
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      ctx.globalCompositeOperation = 'source-over';

      var x0 = Math.max(0, Math.floor(cx - radius));
      var y0 = Math.max(0, Math.floor(cy - radius));
      var x1 = Math.min(canvas.width, Math.ceil(cx + radius));
      var y1 = Math.min(canvas.height, Math.ceil(cy + radius));
      if (x1 <= x0 || y1 <= y0) return;
      var w = x1 - x0;
      var h = y1 - y0;
      if (scratch.width < w || scratch.height < h) {
        scratch.width = Math.max(scratch.width, w);
        scratch.height = Math.max(scratch.height, h);
      }
      scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
      scratchCtx.globalCompositeOperation = 'source-over';
      scratchCtx.clearRect(0, 0, w, h);
      for (var gi = 0; gi < glyphs.length; gi++) {
        blit(scratchCtx, glyphs[gi].dashes, glyphs[gi].offset.x, glyphs[gi].offset.y, x0, y0);
      }
      scratchCtx.globalCompositeOperation = 'destination-in';
      scratchCtx.fillStyle = falloff(scratchCtx, cx - x0, cy - y0, radius, 1, s.softness);
      scratchCtx.fillRect(0, 0, w, h);
      scratchCtx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = presence;
      ctx.drawImage(scratch, 0, 0, w, h, x0, y0, w, h);
      ctx.globalAlpha = 1;
    };

    var crisp = function (value) {
      return (Math.round(value * dpr) + 0.5) / dpr;
    };

    var perimeterPoint = function (distance, w, h) {
      var total = 2 * (w + h);
      var d = ((distance % total) + total) % total;
      if (d < w) return [frame.x1 + d, frame.y1, 0, -1];
      d -= w;
      if (d < h) return [frame.x2, frame.y1 + d, 1, 0];
      d -= h;
      if (d < w) return [frame.x2 - d, frame.y2, 0, 1];
      d -= w;
      return [frame.x1, frame.y2 - d, -1, 0];
    };

    var drawSpecks = function (s, a) {
      var w = frame.x2 - frame.x1;
      var h = frame.y2 - frame.y1;
      if (w < 2 || h < 2) return;
      var perimeter = 2 * (w + h);
      var seed = frame.index + 1;
      var grid = 3;
      var k, period, t, cycle, life, pt, pick, size, large, out, x, y, tone, blink, alpha, left, top, j, head, i, hh, ss;

      for (k = 0; k < s.specks; k++) {
        period = 0.5 + noise(seed, k, 11) * 1.2;
        t = pulse / period + noise(seed, k, 17);
        cycle = Math.floor(t);
        life = t - cycle;
        if (life > 0.7) continue;
        pt = perimeterPoint(noise(seed, k, cycle) * perimeter, w, h);
        pick = noise(seed, k, cycle, 2);
        size = pick < 0.46 ? 2 : pick < 0.7 ? 3 : pick < 0.84 ? 5 : pick < 0.94 ? 8 : 11;
        large = size >= 8;
        out = (large ? 9 : 4) + Math.floor(noise(seed, k, cycle, 1) * 5) * grid;
        x = frame.x1 + Math.round((pt[0] + pt[2] * out - frame.x1) / grid) * grid;
        y = frame.y1 + Math.round((pt[1] + pt[3] * out - frame.y1) / grid) * grid;
        tone = noise(seed, k, cycle, 3);
        blink = life < 0.06 || (life > 0.32 && life < 0.36) ? 0.35 : 1;
        alpha = a * (large ? 0.3 + 0.4 * tone : 0.3 + 0.6 * tone) * blink;
        left = Math.round(x - size / 2);
        top = Math.round(y - size / 2);
        if (tone < 0.26 || (large && tone < 0.78)) {
          ctx.strokeStyle = rgba(s.accentColor, alpha);
          ctx.strokeRect(left + 0.5, top + 0.5, size, size);
          if (large && tone > 0.5) {
            ctx.fillStyle = rgba(s.accentColor, alpha);
            ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
          }
        } else {
          ctx.fillStyle = rgba(s.accentColor, alpha);
          ctx.fillRect(left, top, size, size);
        }
      }

      for (j = 0; j < 2; j++) {
        head = (pulse * 0.42 * s.speed + j * 0.5) * perimeter;
        for (i = 0; i < 4; i++) {
          hh = perimeterPoint(head - i * 6, w, h);
          x = hh[0]; y = hh[1];
          ss = i === 0 ? 3 : 2;
          ctx.fillStyle = rgba(s.accentColor, a * [0.95, 0.55, 0.32, 0.16][i]);
          ctx.fillRect(Math.round(x - ss / 2), Math.round(y - ss / 2), ss, ss);
        }
      }
    };

    var drawFrame = function (s) {
      var glyph = glyphs[frame.index];
      if (!glyph || frame.alpha < 0.01) return;
      var a = frame.alpha;
      var x1 = crisp(frame.x1);
      var y1 = crisp(frame.y1);
      var x2 = crisp(frame.x2);
      var y2 = crisp(frame.y2);
      var ci;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var moved = Math.hypot(glyph.offset.x, glyph.offset.y);
      if (moved > 1) {
        var hx = (glyph.box.x1 + glyph.box.x2) / 2;
        var hy = (glyph.box.y1 + glyph.box.y2) / 2;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + glyph.offset.x, hy + glyph.offset.y);
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(s.accentColor, 0.45 * a);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.rect(Math.round(hx) - 2, Math.round(hy) - 2, 4, 4);
        ctx.fillStyle = rgba(s.accentColor, 0.7 * a);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.rect(x1, y1, x2 - x1, y2 - y1);
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(s.accentColor, 0.5 * a);
      ctx.stroke();

      ctx.beginPath();
      var corners = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
      for (ci = 0; ci < corners.length; ci++) {
        ctx.rect(Math.round(corners[ci][0]) - 2, Math.round(corners[ci][1]) - 2, 5, 5);
      }
      ctx.fillStyle = rgba(s.accentColor, 0.95 * a);
      ctx.fill();

      if (s.specks > 0) {
        ctx.lineWidth = 1;
        drawSpecks(s, a);
      }

      if (!s.labels) return;
      ctx.font = LABEL_FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = rgba(s.accentColor, 0.62 * a);
      var label = moved > 1
        ? (signed(Math.round(glyph.offset.x)) + ', ' + signed(Math.round(-glyph.offset.y)))
        : (glyph.char + '  ' + Math.round(glyph.box.x2 - glyph.box.x1) + ' \u00d7 ' + Math.round(glyph.box.y2 - glyph.box.y1));
      ctx.fillText(label, Math.round(frame.x1), Math.round(frame.y1) - 7);
    };

    var tick = function (now) {
      raf = 0;
      var dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      var view = ensureLayout(settings);

      var sweeping = settings.sweep && !reducedMotion && !pointer.inside && dragging < 0;
      if (sweeping) clock += dt * settings.speed;
      pulse += dt;
      var targetX = pointer.x;
      var targetY = pointer.y;
      var gi, target, focus, glyph;
      if (sweeping) {
        targetX = view.left + (view.right - view.left) * (0.5 - 0.5 * Math.cos(clock * 0.45));
        targetY = view.top + (view.bottom - view.top) * (0.45 + 0.1 * Math.sin(clock * 0.8));
      }
      var active = pointer.inside || sweeping || dragging >= 0;
      if (active && !placed) {
        lens.x = targetX;
        lens.y = targetY;
      }
      if (active) {
        var lag = pointer.inside ? 0.05 : 0.22;
        lens.x = approach(lens.x, targetX, dt, lag);
        lens.y = approach(lens.y, targetY, dt, lag);
      }
      placed = active;
      presence = approach(presence, settings.reveal === 'area' && active && dragging < 0 ? 1 : 0, dt, 0.16);

      var moving = false;
      glyphs.forEach(function (gl, i) {
        if (i === dragging) {
          gl.offset.x = approach(gl.offset.x, pointer.x - grab.x, dt, 0.03);
          gl.offset.y = approach(gl.offset.y, pointer.y - grab.y, dt, 0.03);
          gl.velocity.x = 0;
          gl.velocity.y = 0;
          moving = true;
          return;
        }
        var offset = gl.offset, velocity = gl.velocity;
        if (Math.abs(offset.x) < 0.05 && Math.abs(offset.y) < 0.05 && Math.hypot(velocity.x, velocity.y) < 0.5) {
          offset.x = 0;
          offset.y = 0;
          velocity.x = 0;
          velocity.y = 0;
          return;
        }
        velocity.x += (-SPRING * offset.x - DAMPING * velocity.x) * dt;
        velocity.y += (-SPRING * offset.y - DAMPING * velocity.y) * dt;
        offset.x += velocity.x * dt;
        offset.y += velocity.y * dt;
        moving = true;
      });

      focus = dragging >= 0 ? dragging : active ? glyphAt(lens.x, lens.y) : -1;
      if (focus >= 0 && settings.selection) {
        glyph = glyphs[focus];
        var bx1 = glyph.box.x1 + glyph.offset.x - 6;
        var by1 = glyph.box.y1 + glyph.offset.y - 6;
        var bx2 = glyph.box.x2 + glyph.offset.x + 6;
        var by2 = glyph.box.y2 + glyph.offset.y + 6;
        if (frame.index < 0 || frame.alpha < 0.02) {
          frame.x1 = bx1;
          frame.y1 = by1;
          frame.x2 = bx2;
          frame.y2 = by2;
        }
        var glide = focus === dragging ? 0.02 : 0.08;
        frame.x1 = approach(frame.x1, bx1, dt, glide);
        frame.y1 = approach(frame.y1, by1, dt, glide);
        frame.x2 = approach(frame.x2, bx2, dt, glide);
        frame.y2 = approach(frame.y2, by2, dt, glide);
        frame.index = focus;
      }
      frame.alpha = approach(frame.alpha, focus >= 0 && settings.selection ? 1 : 0, dt, 0.1);

      glyphs.forEach(function (gl, i) {
        target = settings.reveal === 'letter' && i === focus && i !== dragging ? 1 : 0;
        gl.outline = approach(gl.outline, target, dt, 0.09);
        if (Math.abs(gl.outline - target) > 0.002) moving = true;
        else gl.outline = target;
      });

      if (settings.draggable) container.style.cursor = dragging >= 0 ? 'grabbing' : focus >= 0 && pointer.inside ? 'grab' : '';

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var mj, mk;
      for (mj = 0; mj < glyphs.length; mj++) {
        var gm = glyphs[mj];
        var mvd = Math.hypot(gm.offset.x, gm.offset.y);
        if (mvd > 1) {
          ctx.globalAlpha = Math.min(1, mvd / 24) * 0.55;
          blit(ctx, gm.dashes, 0, 0, 0, 0);
          ctx.globalAlpha = 1;
        }
      }
      for (mk = 0; mk < glyphs.length; mk++) {
        var gd = glyphs[mk];
        if (gd.outline < 0.999) {
          ctx.globalAlpha = 1 - gd.outline;
          blit(ctx, gd.fill, gd.offset.x, gd.offset.y, 0, 0);
        }
        if (gd.outline > 0.001) {
          ctx.globalAlpha = gd.outline;
          blit(ctx, gd.dashes, gd.offset.x, gd.offset.y, 0, 0);
        }
        ctx.globalAlpha = 1;
      }
      if (presence > 0.001) drawReveal(settings);
      drawFrame(settings);

      var settling =
        moving ||
        Math.abs(presence - (settings.reveal === 'area' && active && dragging < 0 ? 1 : 0)) > 0.002 ||
        (frame.alpha > 0.01 && frame.alpha < 0.99);
      if ((active || settling) && visible && alive) raf = requestAnimationFrame(tick);
    };

    var wake = function () {
      if (raf || !visible || !alive) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    wakeFn = wake;

    var resize = function () {
      width = Math.max(1, container.clientWidth);
      height = Math.max(1, container.clientHeight);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      layoutKey = '';
      wake();
    };

    var locate = function (e) {
      var rect = container.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    };
    var onMove = function (e) {
      locate(e);
      pointer.inside = true;
      wake();
    };
    var onLeave = function () {
      if (dragging >= 0) return;
      pointer.inside = false;
      wake();
    };
    var onDown = function (e) {
      locate(e);
      pointer.inside = true;
      if (settings.draggable && (e.pointerType !== 'mouse' || e.button === 0)) {
        var index = glyphAt(pointer.x, pointer.y);
        if (index >= 0) {
          dragging = index;
          grab.x = pointer.x - glyphs[index].offset.x;
          grab.y = pointer.y - glyphs[index].offset.y;
          if (container.setPointerCapture) {
            try { container.setPointerCapture(e.pointerId); } catch (err) {}
          }
        }
      }
      wake();
    };
    var onUp = function (e) {
      if (dragging >= 0) {
        dragging = -1;
        if (container.releasePointerCapture) {
          try { container.releasePointerCapture(e.pointerId); } catch (err) {}
        }
        var rect = container.getBoundingClientRect();
        pointer.inside =
          e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      }
      wake();
    };

    container.addEventListener('pointermove', onMove, { passive: true });
    container.addEventListener('pointerenter', onMove, { passive: true });
    container.addEventListener('pointerdown', onDown, { passive: true });
    container.addEventListener('pointerup', onUp, { passive: true });
    container.addEventListener('pointercancel', onUp, { passive: true });
    container.addEventListener('pointerleave', onLeave, { passive: true });

    var resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    var intersectionObserver = new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      wake();
    });
    intersectionObserver.observe(container);
    if (document.fonts) document.fonts.ready.then(refreshFonts, refreshFonts);

    resize();

    return function destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      wakeFn = function () {};
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerenter', onMove);
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointercancel', onUp);
      container.removeEventListener('pointerleave', onLeave);
    };
  };
})();
