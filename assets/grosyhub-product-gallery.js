(function () {
  const DESKTOP_MIN = 990;
  const STICKY_GAP = 10;
  const DEFAULT_HEADER_H = 88;

  const getHeaderSection = () =>
    document.querySelector('.header-section.grosyhub-header-section') ||
    document.querySelector('[data-grosyhub-header]');

  const getHeaderLayoutHeight = () => {
    const cssHeight = parseFloat(getComputedStyle(document.body).getPropertyValue('--header-height'));
    if (Number.isFinite(cssHeight) && cssHeight > 0) return Math.round(cssHeight);

    const section = getHeaderSection();
    if (!section) return DEFAULT_HEADER_H;
    return section.offsetHeight || DEFAULT_HEADER_H;
  };

  const updatePdpStickyTop = () => {
    if (window.innerWidth < DESKTOP_MIN) {
      document.documentElement.style.removeProperty('--gh-pdp-sticky-top');
      return;
    }

    const section = getHeaderSection();
    let offset = STICKY_GAP;

    if (section) {
      const rect = section.getBoundingClientRect();
      // Header scrolls with the page: use visible bottom edge, not total height.
      if (rect.bottom > STICKY_GAP) {
        offset = Math.round(rect.bottom + STICKY_GAP);
      }
    } else {
      offset = getHeaderLayoutHeight() + STICKY_GAP;
    }

    document.documentElement.style.setProperty('--gh-pdp-sticky-top', offset + 'px');
  };

  let scrollTicking = false;
  const onScroll = () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
      updatePdpStickyTop();
      scrollTicking = false;
    });
  };

  updatePdpStickyTop();
  window.addEventListener('resize', updatePdpStickyTop, { passive: true });
  window.addEventListener('load', updatePdpStickyTop, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  document.documentElement.addEventListener('gh-header:layout', updatePdpStickyTop);

  const headerSection = getHeaderSection();
  if (headerSection && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(updatePdpStickyTop).observe(headerSection);
  }

  const initGallery = (root) => {
    const thumbs = root.querySelectorAll('[data-gh-thumb]');
    const slides = root.querySelectorAll('[data-gh-slide]');
    const counter = root.querySelector('[data-gh-counter]');
    const zoomBtn = root.querySelector('[data-gh-zoom]');
    const dotsWrap = root.querySelector('[data-gh-gallery-dots]');
    const thumbsTrack = root.querySelector('[data-gh-thumbs-track]');
    const thumbsPrev = root.querySelector('[data-gh-thumbs-prev]');
    const thumbsNext = root.querySelector('[data-gh-thumbs-next]');
    const stage = root.querySelector('[data-gh-gallery-stage]');
    const galleryPrev = root.querySelector('[data-gh-gallery-prev]');
    const galleryNext = root.querySelector('[data-gh-gallery-next]');
    const total = slides.length;
    let activeIndex = 0;

    const updateThumbArrows = () => {
      if (!thumbsTrack) return;
      const maxScroll = thumbsTrack.scrollWidth - thumbsTrack.clientWidth;
      const sl = thumbsTrack.scrollLeft;
      if (thumbsPrev) thumbsPrev.disabled = sl <= 2;
      if (thumbsNext) thumbsNext.disabled = maxScroll <= 2 || sl >= maxScroll - 2;
    };

    const scrollActiveThumbIntoView = () => {
      const activeThumb = root.querySelector('[data-gh-thumb].is-active');
      if (!activeThumb || !thumbsTrack) return;
      const trackRect = thumbsTrack.getBoundingClientRect();
      const thumbRect = activeThumb.getBoundingClientRect();
      if (thumbRect.left < trackRect.left) {
        thumbsTrack.scrollBy({ left: thumbRect.left - trackRect.left - 8, behavior: 'smooth' });
      } else if (thumbRect.right > trackRect.right) {
        thumbsTrack.scrollBy({ left: thumbRect.right - trackRect.right + 8, behavior: 'smooth' });
      }
      requestAnimationFrame(updateThumbArrows);
    };

    const updateDots = (index) => {
      if (!dotsWrap) return;
      dotsWrap.querySelectorAll('[data-gh-gallery-dot]').forEach((dot, i) => {
        dot.classList.toggle('is-active', i === index);
        dot.setAttribute('aria-selected', i === index ? 'true' : 'false');
      });
    };

    const buildDots = () => {
      if (!dotsWrap || total <= 1) return;
      dotsWrap.innerHTML = '';
      for (let i = 0; i < total; i += 1) {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'gh-pdp-gallery__dot' + (i === 0 ? ' is-active' : '');
        dot.dataset.ghGalleryDot = '';
        dot.setAttribute('aria-label', `Go to image ${i + 1}`);
        dot.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
        dot.addEventListener('click', () => showSlide(i));
        dotsWrap.appendChild(dot);
      }
    };

    const showSlide = (index) => {
      if (index < 0 || index >= total) return;
      activeIndex = index;
      slides.forEach((slide, i) => {
        const active = i === index;
        slide.classList.toggle('is-active', active);
        slide.hidden = !active;
      });
      thumbs.forEach((thumb, i) => {
        const active = i === index;
        thumb.classList.toggle('is-active', active);
        thumb.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      if (counter) {
        counter.textContent = `${index + 1} / ${total}`;
      }
      updateDots(index);
      scrollActiveThumbIntoView();
    };

    thumbs.forEach((thumb) => {
      thumb.addEventListener('click', () => {
        const index = Number(thumb.dataset.index);
        if (!Number.isNaN(index)) showSlide(index);
      });
    });

    if (thumbsPrev) {
      thumbsPrev.addEventListener('click', () => {
        if (!thumbsTrack) return;
        thumbsTrack.scrollBy({ left: -thumbsTrack.clientWidth * 0.75, behavior: 'smooth' });
      });
    }

    if (thumbsNext) {
      thumbsNext.addEventListener('click', () => {
        if (!thumbsTrack) return;
        thumbsTrack.scrollBy({ left: thumbsTrack.clientWidth * 0.75, behavior: 'smooth' });
      });
    }

    if (thumbsTrack) {
      thumbsTrack.addEventListener('scroll', () => requestAnimationFrame(updateThumbArrows), { passive: true });
      window.addEventListener('resize', updateThumbArrows, { passive: true });
      updateThumbArrows();
    }

    if (galleryPrev) {
      galleryPrev.addEventListener('click', (e) => {
        e.preventDefault();
        showSlide(activeIndex > 0 ? activeIndex - 1 : total - 1);
      });
    }

    if (galleryNext) {
      galleryNext.addEventListener('click', (e) => {
        e.preventDefault();
        showSlide(activeIndex < total - 1 ? activeIndex + 1 : 0);
      });
    }

    if (zoomBtn) {
      zoomBtn.addEventListener('click', () => {
        const active = root.querySelector('[data-gh-slide].is-active img');
        if (active && active.src) window.open(active.src, '_blank', 'noopener');
      });
    }

    if (stage && total > 1) {
      let touchStartX = 0;
      let touchStartY = 0;

      stage.addEventListener(
        'touchstart',
        (e) => {
          touchStartX = e.changedTouches[0].screenX;
          touchStartY = e.changedTouches[0].screenY;
        },
        { passive: true }
      );

      stage.addEventListener(
        'touchend',
        (e) => {
          const dx = e.changedTouches[0].screenX - touchStartX;
          const dy = e.changedTouches[0].screenY - touchStartY;
          if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
          if (dx < 0 && activeIndex < total - 1) showSlide(activeIndex + 1);
          else if (dx > 0 && activeIndex > 0) showSlide(activeIndex - 1);
        },
        { passive: true }
      );
    }

    buildDots();
  };

  document.querySelectorAll('[data-gh-gallery]').forEach(initGallery);
})();
