/* ScrollStack — vanilla JS port of the React Bits "ScrollStack" stacking cards.
   Same pin/scale math and defaults as the pasted snippet (window-scroll
   mode: stackPosition 20% vh, baseScale 0.85, +0.03 per card, 30px offsets).
   Framework-free: call window.initScrollStack(container, options).
   Deliberate differences from the React original:
   - No Lenis dependency: native window scroll drives the effect, so anchor
     links, the drawer scroll-lock and mobile touch scrolling keep working.
   - Layout positions are measured with transforms cleared and cached
     (re-measured on resize/fonts.ready/load). Reading live rects mid-stack
     would feed each card's own translate back into its trigger math.
   - Scroll handling is rAF-throttled; everything else is line-for-line. */
(function () {
  'use strict';

  window.initScrollStack = function (container, options) {
    var o = {
      itemDistance: 100,
      itemScale: 0.03,
      itemStackDistance: 30,
      stackPosition: '20%',
      scaleEndPosition: '10%',
      baseScale: 0.85,
      rotationAmount: 0,
      blurAmount: 0
    };
    if (options) for (var k in options) o[k] = options[k];
    if (!container) return function () {};

    var cards = Array.prototype.slice.call(container.querySelectorAll('.project'));
    if (!cards.length) return function () {};

    var end = document.createElement('div');
    end.className = 'scroll-stack-end';
    end.setAttribute('aria-hidden', 'true');
    container.appendChild(end);
    container.classList.add('stack-on');

    var i;
    for (i = 0; i < cards.length; i++) {
      if (i < cards.length - 1) cards[i].style.marginBottom = o.itemDistance + 'px';
      cards[i].style.willChange = 'transform, filter';
      cards[i].style.transformOrigin = 'top center';
      cards[i].style.backfaceVisibility = 'hidden';
    }

    var tops = [];
    var endTop = 0;
    var last = new Map();

    var parsePct = function (v, h) {
      if (typeof v === 'string' && v.indexOf('%') !== -1) return (parseFloat(v) / 100) * h;
      return parseFloat(v);
    };
    var calcProgress = function (scrollTop, start, endd) {
      if (scrollTop < start) return 0;
      if (scrollTop > endd) return 1;
      return (scrollTop - start) / (endd - start);
    };

    var update = function () {
      var scrollTop = window.scrollY;
      var vh = window.innerHeight;
      var stackPx = parsePct(o.stackPosition, vh);
      var scalePx = parsePct(o.scaleEndPosition, vh);
      var pinEnd = endTop - vh / 2;
      var ci, card, cardTop, trigS, trigE, pinS, sp, targetScale, scale, rotation, blur, ty, pinned, prev, j, jt, jts;

      for (ci = 0; ci < cards.length; ci++) {
        card = cards[ci];
        cardTop = tops[ci];
        trigS = cardTop - stackPx - o.itemStackDistance * ci;
        trigE = cardTop - scalePx;
        pinS = trigS;
        sp = calcProgress(scrollTop, trigS, trigE);
        targetScale = o.baseScale + ci * o.itemScale;
        scale = 1 - sp * (1 - targetScale);
        rotation = o.rotationAmount ? ci * o.rotationAmount * sp : 0;

        blur = 0;
        if (o.blurAmount) {
          var topCardIndex = 0;
          for (j = 0; j < cards.length; j++) {
            jt = tops[j] - stackPx - o.itemStackDistance * j;
            if (scrollTop >= jt) topCardIndex = j;
          }
          if (ci < topCardIndex) blur = Math.max(0, (topCardIndex - ci) * o.blurAmount);
        }

        ty = 0;
        pinned = scrollTop >= pinS && scrollTop <= pinEnd;
        if (pinned) {
          ty = scrollTop - cardTop + stackPx + o.itemStackDistance * ci;
        } else if (scrollTop > pinEnd) {
          ty = pinEnd - cardTop + stackPx + o.itemStackDistance * ci;
        }

        ty = Math.round(ty * 100) / 100;
        scale = Math.round(scale * 1000) / 1000;
        rotation = Math.round(rotation * 100) / 100;
        blur = Math.round(blur * 100) / 100;

        prev = last.get(ci);
        if (!prev ||
            Math.abs(prev.ty - ty) > 0.1 ||
            Math.abs(prev.s - scale) > 0.001 ||
            Math.abs(prev.r - rotation) > 0.1 ||
            Math.abs(prev.b - blur) > 0.1) {
          card.style.transform = 'translate3d(0, ' + ty + 'px, 0) scale(' + scale + ')' + (rotation ? ' rotate(' + rotation + 'deg)' : '');
          card.style.filter = blur > 0 ? 'blur(' + blur + 'px)' : '';
          last.set(ci, { ty: ty, s: scale, r: rotation, b: blur });
        }
      }
    };

    var measure = function () {
      for (var m = 0; m < cards.length; m++) {
        cards[m].style.transform = '';
        cards[m].style.filter = '';
      }
      last.clear();
      var sy = window.scrollY;
      tops = cards.map(function (c) {
        return c.getBoundingClientRect().top + sy;
      });
      endTop = end.getBoundingClientRect().top + sy;
      update();
    };

    var ticking = false;
    var onScroll = function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          update();
        });
      }
    };
    var rT = null;
    var onResize = function () {
      clearTimeout(rT);
      rT = setTimeout(measure, 150);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    window.addEventListener('load', measure);
    measure();

    return function destroy() {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      clearTimeout(rT);
      container.classList.remove('stack-on');
      if (end.parentNode === container) container.removeChild(end);
    };
  };
})();
