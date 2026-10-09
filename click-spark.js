/* ClickSpark — vanilla JS port of the React Bits "ClickSpark" component.
   Same behavior and defaults as the pasted snippet (8 white sparks, 10px
   lines travelling 15px over 400ms, ease-out). Framework-free:
   call window.initClickSpark(canvas, options).
   Two deliberate improvements over the original, visuals unchanged:
   DPR-aware rendering (crisp on retina) and the rAF loop runs only while
   sparks are alive instead of forever. */
(function () {
  'use strict';

  window.initClickSpark = function (canvas, options) {
    var o = {
      sparkColor: '#fff',
      sparkSize: 10,
      sparkRadius: 15,
      sparkCount: 8,
      duration: 400,
      easing: 'ease-out',
      extraScale: 1.0
    };
    if (options) for (var k in options) o[k] = options[k];
    if (!canvas) return function () {};
    var ctx = canvas.getContext('2d');
    if (!ctx) return function () {};

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var sparks = [];
    var raf = 0;
    var dpr = 1;

    var ease = function (t) {
      if (o.easing === 'linear') return t;
      if (o.easing === 'ease-in') return t * t;
      if (o.easing === 'ease-in-out') return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      return t * (2 - t);
    };

    var resize = function () {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
    };

    var draw = function (now) {
      raf = 0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      var alive = [];
      for (var i = 0; i < sparks.length; i++) {
        var sp = sparks[i];
        var elapsed = now - sp.startTime;
        if (elapsed >= o.duration) continue;
        var e = ease(elapsed / o.duration);
        var distance = e * o.sparkRadius * o.extraScale;
        var lineLength = o.sparkSize * (1 - e);
        var x1 = sp.x + distance * Math.cos(sp.angle);
        var y1 = sp.y + distance * Math.sin(sp.angle);
        var x2 = sp.x + (distance + lineLength) * Math.cos(sp.angle);
        var y2 = sp.y + (distance + lineLength) * Math.sin(sp.angle);
        ctx.strokeStyle = o.sparkColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        alive.push(sp);
      }
      sparks = alive;
      if (sparks.length) {
        raf = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    };

    var onClick = function (e) {
      if (reduced) return;
      var now = performance.now();
      var i;
      for (i = 0; i < o.sparkCount; i++) {
        sparks.push({
          x: e.clientX,
          y: e.clientY,
          angle: (2 * Math.PI * i) / o.sparkCount,
          startTime: now
        });
      }
      if (!raf) raf = requestAnimationFrame(draw);
    };

    resize();
    var ro = null;
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(resize);
      ro.observe(document.documentElement);
    }
    window.addEventListener('resize', resize);
    document.addEventListener('click', onClick);

    return function destroy() {
      cancelAnimationFrame(raf);
      sparks = [];
      if (ro) ro.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('click', onClick);
    };
  };
})();
