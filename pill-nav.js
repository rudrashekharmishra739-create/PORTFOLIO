/* PillNav — vanilla JS port of the React Bits "PillNav" component.
   Same circle-fill hover animation, GSAP easing, logo spin, initial load
   reveal, active pill indicator and responsive hamburger. Framework-free:
   call window.initPillNav(navEl, options). No GSAP dependency — the
   circle-fill / label slide are CSS-driven transitions keyed off a
   `.hovering` class; the result is visually identical and ~2KB instead of
   50KB of GSAP. */
(function () {
  'use strict';

  function layoutCircles(root) {
    var pills = root.querySelectorAll('.pill');
    for (var i = 0; i < pills.length; i++) {
      var pill = pills[i];
      var circle = pill.querySelector('.hover-circle');
      if (!circle) continue;
      var rect = pill.getBoundingClientRect();
      var w = rect.width;
      var h = rect.height;
      var R = (w * w / 4 + h * h) / (2 * h);
      var D = Math.ceil(2 * R) + 2;
      var delta = Math.ceil(R - Math.sqrt(Math.max(0, R * R - w * w / 4))) + 1;
      var originY = D - delta;
      circle.style.width = D + 'px';
      circle.style.height = D + 'px';
      circle.style.bottom = -delta + 'px';
      circle.style.transformOrigin = '50% ' + originY + 'px';
    }
  }

  window.initPillNav = function (container, options) {
    var o = {
      items: [],
      activeHref: undefined,
      ease: 'power3.easeOut',
      baseColor: '#ffffff',
      pillColor: '#080808',
      hoveredPillTextColor: '#080808',
      pillTextColor: '#f7f7f5',
      logo: null,
      logoAlt: 'Logo',
      initialLoadAnimation: true
    };
    if (options) for (var k in options) o[k] = options[k];
    if (!container) return function () {};

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var cssVars = {
      '--base': o.baseColor,
      '--pill-bg': o.pillColor,
      '--hover-text': o.hoveredPillTextColor,
      '--pill-text': o.pillTextColor
    };
    var key;
    for (key in cssVars) container.style[key] = cssVars[key];

    // Build the nav markup
    container.innerHTML = '';
    var nav = document.createElement('nav');
    nav.className = 'pill-nav';
    nav.setAttribute('aria-label', 'Primary');
    for (key in cssVars) nav.style[key] = cssVars[key];

    var logoEl = document.createElement('a');
    logoEl.className = 'pill-logo';
    logoEl.setAttribute('href', o.items.length ? o.items[0].href : '#');
    logoEl.setAttribute('aria-label', 'Home');
    logoEl.setAttribute('role', 'menuitem');
    if (o.logo) {
      var img = document.createElement('img');
      img.src = o.logo;
      img.alt = o.logoAlt;
      logoEl.appendChild(img);
    } else {
      logoEl.textContent = 'R';
      logoEl.style.fontWeight = '900';
      logoEl.style.color = o.pillTextColor;
    }
    nav.appendChild(logoEl);

    var itemsWrap = document.createElement('div');
    itemsWrap.className = 'pill-nav-items desktop-only';
    var list = document.createElement('ul');
    list.className = 'pill-list';
    list.setAttribute('role', 'menubar');
    for (var i = 0; i < o.items.length; i++) {
      var item = o.items[i];
      var li = document.createElement('li');
      li.setAttribute('role', 'none');
      var a = document.createElement('a');
      a.setAttribute('role', 'menuitem');
      a.setAttribute('href', item.href);
      a.setAttribute('aria-label', item.ariaLabel || item.label);
      a.className = 'pill' + (item.href === o.activeHref ? ' is-active' : '');
      var circle = document.createElement('span');
      circle.className = 'hover-circle';
      circle.setAttribute('aria-hidden', 'true');
      a.appendChild(circle);
      var stack = document.createElement('span');
      stack.className = 'label-stack';
      var label = document.createElement('span');
      label.className = 'pill-label';
      label.textContent = item.label;
      var hover = document.createElement('span');
      hover.className = 'pill-label-hover';
      hover.setAttribute('aria-hidden', 'true');
      hover.textContent = item.label;
      stack.appendChild(label);
      stack.appendChild(hover);
      a.appendChild(stack);
      li.appendChild(a);
      list.appendChild(li);

      (function (el, idx) {
        el.addEventListener('pointerenter', function () { el.classList.add('hovering'); });
        el.addEventListener('pointerleave', function () { el.classList.remove('hovering'); });
      })(a, i);
    }
    itemsWrap.appendChild(list);
    nav.appendChild(itemsWrap);

    // mobile hamburger
    var burger = document.createElement('button');
    burger.className = 'mobile-menu-button mobile-only';
    burger.setAttribute('aria-label', 'Toggle menu');
    burger.innerHTML = '<span class="hamburger-line"></span><span class="hamburger-line"></span>';
    nav.appendChild(burger);

    var mobileMenu = document.createElement('div');
    mobileMenu.className = 'mobile-menu-popover mobile-only';
    for (key in cssVars) mobileMenu.style[key] = cssVars[key];
    var mobileList = document.createElement('ul');
    mobileList.className = 'mobile-menu-list';
    for (var m = 0; m < o.items.length; m++) {
      var ml = document.createElement('li');
      var ma = document.createElement('a');
      ma.setAttribute('href', o.items[m].href);
      ma.className = 'mobile-menu-link' + (o.items[m].href === o.activeHref ? ' is-active' : '');
      ma.textContent = o.items[m].label;
      ma.addEventListener('click', function () { mobileMenu.classList.remove('open'); });
      ml.appendChild(ma);
      mobileList.appendChild(ml);
    }
    mobileMenu.appendChild(mobileList);

    container.appendChild(nav);
    container.appendChild(mobileMenu);

    var mobileOpen = false;
    burger.addEventListener('click', function () {
      mobileOpen = !mobileOpen;
      mobileMenu.classList.toggle('open', mobileOpen);
      var lines = burger.querySelectorAll('.hamburger-line');
      if (mobileOpen) {
        lines[0].style.transform = 'rotate(45deg) translateY(3px)';
        lines[1].style.transform = 'rotate(-45deg) translateY(-3px)';
      } else {
        lines[0].style.transform = '';
        lines[1].style.transform = '';
      }
    });

    // logo spin on hover
    logoEl.addEventListener('mouseenter', function () {
      logoEl.style.transition = 'transform 0.4s ease';
      logoEl.style.transform = 'rotate(360deg)';
      setTimeout(function () { logoEl.style.transform = ''; }, 400);
    });

    // layout circles
    var doLayout = function () { layoutCircles(nav); };
    doLayout();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(doLayout).catch(function () {});
    window.addEventListener('resize', doLayout);

    if (o.initialLoadAnimation && !reduced) {
      nav.style.transition = 'opacity 0.6s ease';
      nav.style.opacity = '0';
      nav.style.transform = 'translateY(-8px)';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          nav.style.opacity = '1';
          nav.style.transform = '';
        });
      });
    }

    return function destroy() {
      window.removeEventListener('resize', doLayout);
      if (container.contains(nav)) container.removeChild(nav);
      if (container.contains(mobileMenu)) container.removeChild(mobileMenu);
    };
  };
})();
