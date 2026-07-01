(function () {
  const lockScroll = () => {
    document.documentElement.classList.add('gh-pdp-reels-modal-open');
    document.body.style.overflow = 'hidden';
  };

  const unlockScroll = () => {
    document.documentElement.classList.remove('gh-pdp-reels-modal-open');
    document.body.style.overflow = '';
  };

  const initCarousel = (root) => {
    const track = root.querySelector('[data-gh-pdp-reels-track]');
    const prev = root.querySelector('[data-gh-pdp-reels-prev]');
    const next = root.querySelector('[data-gh-pdp-reels-next]');
    if (!track) return;

    const slides = () => Array.from(track.querySelectorAll('[data-gh-pdp-reels-slide]'));
    const gap = () => parseInt(getComputedStyle(track).gap, 10) || 12;

    const slideWidth = () => {
      const first = slides()[0];
      if (!first) return track.clientWidth;
      return first.offsetWidth + gap();
    };

    let index = 0;

    const scrollToIndex = (i) => {
      const max = Math.max(0, slides().length - 1);
      index = Math.max(0, Math.min(i, max));
      track.scrollTo({ left: index * slideWidth(), behavior: 'smooth' });
      if (prev) prev.disabled = index <= 0;
      if (next) next.disabled = index >= max;
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
          if (prev) prev.disabled = index <= 0;
          if (next) next.disabled = index >= slides().length - 1;
        }
      },
      { passive: true }
    );

    scrollToIndex(0);
  };

  const initStripVideos = (root) => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    root.querySelectorAll('.gh-pdp-reel-card').forEach((card) => {
      const video = card.querySelector('.gh-pdp-reel-card__video');
      const poster = card.querySelector('[data-gh-pdp-reel-poster]');
      if (!video) return;

      video.muted = true;
      video.playsInline = true;
      video.loop = true;

      const play = () => {
        if (poster) poster.classList.add('is-hidden');
        const p = video.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
        card.classList.add('is-playing');
      };

      const pause = () => {
        video.pause();
        if (poster) poster.classList.remove('is-hidden');
        card.classList.remove('is-playing');
      };

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.35) play();
            else pause();
          });
        },
        { threshold: [0, 0.35, 0.6] }
      );

      observer.observe(card);
    });
  };

  const pauseAllModalVideos = (modal) => {
    modal.querySelectorAll('.gh-pdp-reels-modal__video').forEach((v) => v.pause());
  };

  const playPanelVideo = (panel) => {
    const video = panel?.querySelector('.gh-pdp-reels-modal__video');
    if (!video) return;
    video.muted = panel.querySelector('[data-gh-pdp-reels-mute]')?.getAttribute('aria-pressed') !== 'false';
    const p = video.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  };

  const initModal = (root) => {
    const modal = root.querySelector('[data-gh-pdp-reels-modal]');
    if (!modal) return;

    const panels = () => Array.from(modal.querySelectorAll('[data-gh-pdp-reels-panel]'));
    let activeIndex = 0;

    const showPanel = (index) => {
      const list = panels();
      if (!list.length) return;
      activeIndex = ((index % list.length) + list.length) % list.length;

      pauseAllModalVideos(modal);

      list.forEach((panel, i) => {
        const isActive = i === activeIndex;
        panel.classList.toggle('is-active', isActive);
        panel.hidden = !isActive;
      });

      playPanelVideo(list[activeIndex]);
    };

    const openModal = (index) => {
      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
      lockScroll();
      showPanel(index);
    };

    const closeModal = () => {
      pauseAllModalVideos(modal);
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      unlockScroll();
    };

    root.querySelectorAll('[data-gh-pdp-reel-open]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-gh-pdp-reel-open'), 10);
        openModal(Number.isNaN(idx) ? 0 : idx);
      });
    });

    modal.querySelectorAll('[data-gh-pdp-reels-close]').forEach((el) => {
      el.addEventListener('click', closeModal);
    });

    modal.querySelector('[data-gh-pdp-reels-modal-prev]')?.addEventListener('click', () => {
      showPanel(activeIndex - 1);
    });

    modal.querySelector('[data-gh-pdp-reels-modal-next]')?.addEventListener('click', () => {
      showPanel(activeIndex + 1);
    });

    modal.querySelectorAll('[data-gh-pdp-reels-mute]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const panel = btn.closest('[data-gh-pdp-reels-panel]');
        const video = panel?.querySelector('.gh-pdp-reels-modal__video');
        if (!video) return;
        const muted = btn.getAttribute('aria-pressed') !== 'false';
        const nextMuted = !muted;
        video.muted = nextMuted;
        btn.setAttribute('aria-pressed', nextMuted ? 'true' : 'false');
        btn.setAttribute('aria-label', nextMuted ? 'Unmute video' : 'Mute video');
      });
    });

    modal.querySelectorAll('[data-gh-pdp-reels-add-cart]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const variantId = btn.getAttribute('data-gh-pdp-reels-add-cart');
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

    document.addEventListener('keydown', (e) => {
      if (modal.hidden) return;
      if (e.key === 'Escape') closeModal();
      if (e.key === 'ArrowLeft') showPanel(activeIndex - 1);
      if (e.key === 'ArrowRight') showPanel(activeIndex + 1);
    });
  };

  const init = (root) => {
    if (root.dataset.ghPdpReelsReady === 'true') return;
    root.dataset.ghPdpReelsReady = 'true';
    initCarousel(root);
    initStripVideos(root);
    initModal(root);
  };

  document.querySelectorAll('[data-gh-pdp-reels]').forEach(init);

  document.addEventListener('shopify:section:load', (e) => {
    e.target?.querySelectorAll?.('[data-gh-pdp-reels]')?.forEach(init);
  });
})();
