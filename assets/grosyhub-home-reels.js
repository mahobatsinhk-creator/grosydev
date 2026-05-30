(function () {
  const initCarousel = (root) => {
    const track = root.querySelector('[data-gh-reels-track]');
    const prev = root.querySelector('[data-gh-reels-prev]');
    const next = root.querySelector('[data-gh-reels-next]');
    const dotsWrap =
      root.closest('[data-gh-reels-body]')?.querySelector('[data-gh-reels-dots]') ||
      root.parentElement?.querySelector('[data-gh-reels-dots]');
    if (!track) return;

    const slides = () => Array.from(track.querySelectorAll('[data-gh-reels-slide]'));
    const gap = () => parseInt(getComputedStyle(track).gap, 10) || 16;

    const slideWidth = () => {
      const first = slides()[0];
      if (!first) return track.clientWidth;
      return first.offsetWidth + gap();
    };

    const visibleCount = () => {
      const sw = slideWidth();
      if (!sw) return 1;
      return Math.max(1, Math.floor(track.clientWidth / sw));
    };

    const maxIndex = () => Math.max(0, slides().length - visibleCount());

    let index = 0;

    const scrollToIndex = (i) => {
      if (!slides().length) return;
      index = Math.max(0, Math.min(i, maxIndex()));
      track.scrollTo({ left: index * slideWidth(), behavior: 'smooth' });
      updateDots();
      updateArrows();
    };

    const updateArrows = () => {
      const hasSlides = slides().length > visibleCount();
      if (prev) prev.disabled = !hasSlides || index <= 0;
      if (next) next.disabled = !hasSlides || index >= maxIndex();
    };

    const updateDots = () => {
      if (!dotsWrap) return;
      dotsWrap.querySelectorAll('[data-gh-reels-dot]').forEach((dot, i) => {
        dot.classList.toggle('is-active', i === index);
        dot.setAttribute('aria-selected', i === index ? 'true' : 'false');
      });
    };

    const buildDots = () => {
      if (!dotsWrap) return;
      dotsWrap.innerHTML = '';
      const total = maxIndex() + 1;
      if (total <= 1) return;

      for (let i = 0; i < total; i += 1) {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'gh-reels__dot';
        dot.dataset.ghReelsDot = '';
        dot.setAttribute('aria-label', `Go to reel page ${i + 1}`);
        if (i === 0) {
          dot.classList.add('is-active');
          dot.setAttribute('aria-selected', 'true');
        }
        dot.addEventListener('click', () => scrollToIndex(i));
        dotsWrap.appendChild(dot);
      }
    };

    prev?.addEventListener('click', () => scrollToIndex(index - 1));
    next?.addEventListener('click', () => scrollToIndex(index + 1));

    track.addEventListener(
      'scroll',
      () => {
        const sw = slideWidth();
        if (!sw) return;
        const i = Math.round(track.scrollLeft / sw);
        if (i !== index) {
          index = i;
          updateDots();
          updateArrows();
        }
      },
      { passive: true }
    );

    const onResize = () => {
      buildDots();
      scrollToIndex(Math.min(index, maxIndex()));
    };

    buildDots();
    updateArrows();
    window.addEventListener('resize', onResize);
    root._ghReelsCleanup = () => window.removeEventListener('resize', onResize);
  };

  const initVideos = (scope) => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cards = [];

    scope.querySelectorAll('[data-gh-reel-card]').forEach((card) => {
      if (card.dataset.ghReelVideoReady === 'true') return;
      card.dataset.ghReelVideoReady = 'true';

      const video = card.querySelector('.gh-reel-card__video');
      const poster = card.querySelector('[data-gh-reel-poster]');
      if (!video) return;

      video.muted = true;
      video.playsInline = true;
      video.loop = true;
      video.autoplay = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.setAttribute('muted', '');

      const showPoster = (show) => {
        if (poster) poster.classList.toggle('is-hidden', !show);
      };

      card._ghReelPlay = () => {
        if (reduceMotion) return;
        showPoster(false);
        const p = video.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
        card.classList.add('is-playing');
      };

      card._ghReelPause = () => {
        video.pause();
        showPoster(true);
        card.classList.remove('is-playing');
      };

      cards.push(card);
    });

    if (!cards.length || reduceMotion) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const card = entry.target;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
            card._ghReelPlay?.();
          } else {
            card._ghReelPause?.();
          }
        });
      },
      { root: null, threshold: [0, 0.25, 0.5, 0.75] }
    );

    cards.forEach((card) => observer.observe(card));
    scope._ghReelsVideoObserver = observer;
  };

  const initAddToCart = (scope) => {
    scope.querySelectorAll('[data-gh-reel-add-cart]').forEach((btn) => {
      if (btn.dataset.ghReelCartReady === 'true') return;
      btn.dataset.ghReelCartReady = 'true';

      btn.addEventListener('click', async () => {
        const variantId = btn.getAttribute('data-gh-reel-add-cart');
        if (!variantId) return;
        btn.disabled = true;
        try {
          const res = await fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }] }),
          });
          if (!res.ok) throw new Error('Add failed');
          if (window.GhCartDrawer) await window.GhCartDrawer.refresh();
          document.dispatchEvent(new CustomEvent('gh:cart:open'));
        } catch (err) {
          console.error(err);
        } finally {
          btn.disabled = false;
        }
      });
    });
  };

  const initSection = (section) => {
    section.querySelectorAll('[data-gh-reels-carousel]').forEach((el) => {
      if (el.dataset.ghReelsCarouselReady === 'true') return;
      el.dataset.ghReelsCarouselReady = 'true';
      initCarousel(el);
    });
    initVideos(section);
    initAddToCart(section);
  };

  document.querySelectorAll('.gh-reels').forEach(initSection);

  document.addEventListener('shopify:section:load', (e) => {
    const root = e.target;
    const section = root?.classList?.contains('gh-reels') ? root : root?.querySelector?.('.gh-reels');
    if (section) initSection(section);
  });
})();
