(function () {
  const initPageCarousel = (root) => {
    const tracks = Array.from(root.querySelectorAll('[data-gh-rec-track]'));
    const prev = root.querySelector('[data-gh-rec-prev]');
    const next = root.querySelector('[data-gh-rec-next]');
    const dotsWrap =
      root.closest('[data-gh-rec-body]')?.querySelector('[data-gh-rec-dots]') ||
      root.querySelector('[data-gh-rec-dots]');
    if (!tracks.length) return;

    const mobileMq = window.matchMedia('(max-width: 749px)');
    const trackWraps = tracks.map((t) => t.closest('.gh-tn__track-wrap, .gh-bs__track-wrap') || t.parentElement);

    const pickTrack = () => {
      if (tracks.length === 1) return tracks[0];
      return mobileMq.matches ? tracks[1] : tracks[0];
    };

    let track = pickTrack();
    let index = 0;

    const syncTracks = () => {
      if (tracks.length === 1) return;
      tracks.forEach((t, i) => {
        const wrap = trackWraps[i];
        const isActive = t === track;
        if (wrap) wrap.hidden = !isActive;
      });
    };

    const slides = () => Array.from(track.querySelectorAll('[data-gh-rec-slide]'));

    const scrollToPage = (i) => {
      const list = slides();
      if (!list.length) return;
      index = Math.max(0, Math.min(i, list.length - 1));
      track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
      updateDots();
      updateArrows();
    };

    const updateArrows = () => {
      const list = slides();
      const hasPages = list.length > 1;
      if (prev) prev.disabled = !hasPages || index <= 0;
      if (next) next.disabled = !hasPages || index >= list.length - 1;
    };

    const updateDots = () => {
      if (!dotsWrap) return;
      dotsWrap.querySelectorAll('[data-gh-rec-dot]').forEach((dot, i) => {
        dot.classList.toggle('is-active', i === index);
        dot.setAttribute('aria-selected', i === index ? 'true' : 'false');
      });
    };

    const buildDots = () => {
      if (!dotsWrap) return;
      dotsWrap.innerHTML = '';
      const total = slides().length;
      if (total <= 1) return;

      for (let i = 0; i < total; i += 1) {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'gh-rec__dot';
        dot.dataset.ghRecDot = '';
        dot.setAttribute('aria-label', `Go to page ${i + 1}`);
        if (i === 0) {
          dot.classList.add('is-active');
          dot.setAttribute('aria-selected', 'true');
        }
        dot.addEventListener('click', () => scrollToPage(i));
        dotsWrap.appendChild(dot);
      }
    };

    const onScroll = () => {
      const w = track.clientWidth;
      if (!w) return;
      const i = Math.round(track.scrollLeft / w);
      if (i !== index) {
        index = i;
        updateDots();
        updateArrows();
      }
    };

    prev?.addEventListener('click', () => scrollToPage(index - 1));
    next?.addEventListener('click', () => scrollToPage(index + 1));
    track.addEventListener('scroll', onScroll, { passive: true });

    const onResize = () => {
      const nextTrack = pickTrack();
      if (nextTrack !== track) {
        track.removeEventListener('scroll', onScroll);
        track = nextTrack;
        index = 0;
        track.addEventListener('scroll', onScroll, { passive: true });
      }
      syncTracks();
      buildDots();
      scrollToPage(Math.min(index, Math.max(0, slides().length - 1)));
    };

    syncTracks();
    buildDots();
    updateArrows();
    window.addEventListener('resize', onResize);
    if (mobileMq.addEventListener) {
      mobileMq.addEventListener('change', onResize);
    } else {
      mobileMq.addListener(onResize);
    }
    root._ghRecPageCleanup = () => {
      window.removeEventListener('resize', onResize);
      track.removeEventListener('scroll', onScroll);
      if (mobileMq.removeEventListener) {
        mobileMq.removeEventListener('change', onResize);
      } else {
        mobileMq.removeListener(onResize);
      }
    };
  };

  const initCarousel = (root) => {
    const track = root.querySelector('[data-gh-rec-track]');
    const prev = root.querySelector('[data-gh-rec-prev]');
    const next = root.querySelector('[data-gh-rec-next]');
    const dotsWrap =
      root.closest('[data-gh-rec-body]')?.querySelector('[data-gh-rec-dots]') ||
      root.parentElement?.querySelector('[data-gh-rec-dots]');
    if (!track) return;

    const slides = () => Array.from(track.querySelectorAll('[data-gh-rec-slide]'));
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
      dotsWrap.querySelectorAll('[data-gh-rec-dot]').forEach((dot, i) => {
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
        dot.className = 'gh-rec__dot';
        dot.dataset.ghRecDot = '';
        dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
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
    root._ghRecCleanup = () => window.removeEventListener('resize', onResize);
  };

  const initAll = (scope = document) => {
    scope.querySelectorAll('[data-gh-rec-page-carousel]').forEach((el) => {
      if (el.dataset.ghRecReady === 'true') return;
      if (!el.querySelector('.gh-rec-card')) return;
      el.dataset.ghRecReady = 'true';
      initPageCarousel(el);
    });

    scope.querySelectorAll('[data-gh-rec-carousel]').forEach((el) => {
      delete el.dataset.ghRecReady;
      if (!el.querySelector('.gh-rec-card')) return;
      if (el.dataset.ghRecReady === 'true') return;
      el.dataset.ghRecReady = 'true';
      initCarousel(el);
    });
  };

  const fetchApiRecommendations = async (host) => {
    if (host.dataset.apiLoaded === 'true') return;

    const productId = host.dataset.productId;
    const sectionId = host.dataset.sectionId;
    const intent = host.dataset.intent || 'related';
    if (!productId || !sectionId) return;

    const url = `${host.dataset.url}&product_id=${productId}&section_id=${sectionId}&intent=${intent}`;

    try {
      const response = await fetch(url);
      if (!response.ok) return;

      const html = await response.text();
      if (!html || !html.trim()) return;

      const doc = new DOMParser().parseFromString(html, 'text/html');
      const sectionEl =
        doc.getElementById(`shopify-section-${sectionId}`) || doc.querySelector(`[data-section-id="${sectionId}"]`);
      const newBody = sectionEl?.querySelector('[data-gh-rec-body]');
      const oldBody = host.querySelector('[data-gh-rec-body]');

      if (!newBody || !oldBody) return;

      const hasCards = newBody.querySelector('.gh-rec-card');
      if (!hasCards) return;

      oldBody.innerHTML = newBody.innerHTML;
      host.dataset.apiLoaded = 'true';
      initAll(host);
    } catch (error) {
      console.warn('Grosyhub recommendations:', error);
    }
  };

  const observeHost = (host) => {
    if (host.dataset.ghRecObserved === 'true') return;
    host.dataset.ghRecObserved = 'true';

    initAll(host);

    if (host.dataset.apiLoaded === 'true') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        fetchApiRecommendations(host);
      },
      { rootMargin: '0px 0px 300px 0px' }
    );

    observer.observe(host);
  };

  const boot = (scope = document) => {
    scope.querySelectorAll('[data-gh-rec-host]').forEach(observeHost);
    initAll(scope);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot());
  } else {
    boot();
  }

  document.addEventListener('shopify:section:load', (event) => {
    boot(event.target);
  });
})();
