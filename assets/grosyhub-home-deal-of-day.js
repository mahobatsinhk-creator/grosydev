(function () {
  const pad = (n) => String(n).padStart(2, '0');

  const initCountdown = (root) => {
    const wrap = root.querySelector('[data-gh-dod-countdown]');
    if (!wrap) return;

    const hours = Number(wrap.dataset.hours) || 24;
    const endMs = Date.now() + hours * 3600000;

    const hEl = wrap.querySelector('[data-gh-dod-hours]');
    const mEl = wrap.querySelector('[data-gh-dod-minutes]');
    const sEl = wrap.querySelector('[data-gh-dod-seconds]');

    const tick = () => {
      const diff = Math.max(0, endMs - Date.now());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (hEl) hEl.textContent = pad(h);
      if (mEl) mEl.textContent = pad(m);
      if (sEl) sEl.textContent = pad(s);
    };

    tick();
    const id = window.setInterval(tick, 1000);
    wrap._ghDodTimer = id;
  };

  const initGallery = (root) => {
    const mainImg = root.querySelector('[data-gh-dod-main-img]');
    const thumbs = root.querySelectorAll('[data-gh-dod-thumb]');
    if (!mainImg || !thumbs.length) return;

    thumbs.forEach((btn) => {
      btn.addEventListener('click', () => {
        const src = btn.dataset.fullSrc;
        const alt = btn.dataset.alt || '';
        if (!src) return;
        mainImg.src = src;
        mainImg.alt = alt;
        thumbs.forEach((t) => {
          const active = t === btn;
          t.classList.toggle('is-active', active);
          t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
      });
    });
  };

  const initAddToCart = (root) => {
    const btn = root.querySelector('[data-gh-dod-add-cart]');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      const variantId = btn.getAttribute('data-gh-dod-add-cart');
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
  };

  const initSection = (section) => {
    initCountdown(section);
    initGallery(section);
    initAddToCart(section);
  };

  document.querySelectorAll('.gh-dod').forEach(initSection);

  document.addEventListener('shopify:section:load', (e) => {
    const root = e.target?.classList?.contains('gh-dod') ? e.target : e.target?.querySelector?.('.gh-dod');
    if (root) initSection(root);
  });
})();
