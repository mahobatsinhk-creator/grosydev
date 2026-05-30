(function () {
  const initSlider = (root) => {
    if (root.dataset.ghHeroReady === 'true') return;
    const slides = Array.from(root.querySelectorAll('[data-gh-hero-slide]'));
    if (!slides.length) return;

    root.dataset.ghHeroReady = 'true';

    const prev = root.querySelector('[data-gh-hero-prev]');
    const next = root.querySelector('[data-gh-hero-next]');
    const dotsWrap = root.querySelector('[data-gh-hero-dots]');
    const autoplay = root.dataset.autoplay === 'true';
    const intervalMs = Number(root.dataset.interval) || 5000;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let index = slides.findIndex((s) => s.classList.contains('is-active'));
    if (index < 0) index = 0;

    const goTo = (i) => {
      if (!slides.length) return;
      index = ((i % slides.length) + slides.length) % slides.length;
      slides.forEach((slide, n) => {
        const active = n === index;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', active ? 'false' : 'true');
        const link = slide.querySelector('.gh-hero-banner__link');
        if (link) link.setAttribute('tabindex', active ? '0' : '-1');
      });
      if (dotsWrap) {
        dotsWrap.querySelectorAll('[data-gh-hero-dot]').forEach((dot, n) => {
          dot.classList.toggle('is-active', n === index);
          dot.setAttribute('aria-selected', n === index ? 'true' : 'false');
        });
      }
    };

    const buildDots = () => {
      if (!dotsWrap || slides.length <= 1) return;
      dotsWrap.innerHTML = '';
      slides.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'gh-hero-banner__dot' + (i === index ? ' is-active' : '');
        dot.dataset.ghHeroDot = '';
        dot.setAttribute('role', 'tab');
        dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
        dot.setAttribute('aria-selected', i === index ? 'true' : 'false');
        dot.addEventListener('click', () => {
          goTo(i);
          resetAutoplay();
        });
        dotsWrap.appendChild(dot);
      });
    };

    if (prev) {
      prev.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        goTo(index - 1);
        resetAutoplay();
      });
    }

    if (next) {
      next.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        goTo(index + 1);
        resetAutoplay();
      });
    }

    let timer = null;
    const resetAutoplay = () => {
      clearInterval(timer);
      if (!autoplay || slides.length <= 1 || reduceMotion) return;
      timer = setInterval(() => goTo(index + 1), intervalMs);
    };

    buildDots();
    goTo(index);
    resetAutoplay();

    root.addEventListener('mouseenter', () => clearInterval(timer));
    root.addEventListener('mouseleave', resetAutoplay);

    let touchStartX = 0;
    root.addEventListener(
      'touchstart',
      (e) => {
        touchStartX = e.changedTouches[0].screenX;
      },
      { passive: true }
    );
    root.addEventListener(
      'touchend',
      (e) => {
        const dx = e.changedTouches[0].screenX - touchStartX;
        if (Math.abs(dx) < 40) return;
        if (dx < 0) goTo(index + 1);
        else goTo(index - 1);
        resetAutoplay();
      },
      { passive: true }
    );
  };

  const boot = () => {
    document.querySelectorAll('[data-gh-hero-slider]').forEach(initSlider);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('shopify:section:load', (e) => {
    const section = e.target.querySelector?.('[data-gh-hero-slider]') || e.target.closest?.('[data-gh-hero-slider]');
    const root = section || e.target.querySelector?.('[data-gh-hero-slider]');
    if (root) {
      root.dataset.ghHeroReady = '';
      initSlider(root);
    } else {
      e.target.querySelectorAll?.('[data-gh-hero-slider]')?.forEach((el) => {
        el.dataset.ghHeroReady = '';
        initSlider(el);
      });
    }
  });
})();
