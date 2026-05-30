/**
 * Grosyhub header — desktop mega, mobile drawers, wishlist.
 */
(function () {
  const header = document.querySelector('[data-grosyhub-header]');
  if (!header) return;

  /* Move overlays to body so hero banner cannot stack above drawers */
  document.querySelectorAll('.gh-drawer, .gh-nav-drawer, .gh-mobile-search-overlay').forEach((el) => {
    if (el.parentElement !== document.body) {
      document.body.appendChild(el);
    }
  });

  const mqDesktop = window.matchMedia('(min-width: 990px)');

  /* Header height for theme layout (mobile: announcement + sticky nav bar) */
  const mobileBlock = header.querySelector('.gh-header__mobile');
  const mobileShell = header.querySelector('.gh-header__mobile-shell');

  const setHeights = () => {
    const section =
      document.querySelector('.header-section.grosyhub-header-section') || header.parentElement || header;
    const isMobile = !mqDesktop.matches;
    let h;

    if (isMobile && mobileBlock) {
      h = Math.ceil(mobileBlock.getBoundingClientRect().height);
      /* Natural height only — fixed min-height left a white gap above the hero */
      section.style.minHeight = '';
      section.style.paddingTop = '0';
      section.style.marginTop = '0';
      section.style.paddingBottom = '0';
      const headerGroupEl = document.getElementById('header-group');
      if (headerGroupEl) {
        headerGroupEl.style.marginTop = '0';
        headerGroupEl.style.paddingTop = '0';
        headerGroupEl.style.marginBottom = '0';
        headerGroupEl.style.paddingBottom = '0';
        headerGroupEl.style.background = 'transparent';
      }
      section.style.marginBottom = '0';
      section.style.paddingBottom = '0';
      if (mobileShell) {
        const shellH = Math.ceil(mobileShell.getBoundingClientRect().height);
        document.body.style.setProperty('--gh-mobile-shell-height', shellH + 'px');
      }
    } else {
      section.style.minHeight = '';
      document.body.style.removeProperty('--gh-mobile-shell-height');
      h = section.offsetHeight || header.offsetHeight;
    }

    document.body.style.setProperty('--header-height', h + 'px');
    document.body.style.setProperty('--header-group-height', h + 'px');
    document.documentElement.dispatchEvent(
      new CustomEvent('gh-header:layout', { detail: { height: h } })
    );

    flushHomeHeroGap(isMobile);
  };

  const HOME_HERO_SECTION_SELECTOR =
    '#MainContent > .shopify-section.grosyhub-hero-slider-section, #MainContent > [data-gh-banner-mount] .shopify-section.grosyhub-hero-slider-section';

  /** Pull homepage hero flush under header on mobile (removes white strip) */
  const flushHomeHeroGap = (isMobile) => {
    const heroSection = document.querySelector(HOME_HERO_SECTION_SELECTOR);
    const heroBanner = heroSection?.querySelector('.gh-hero-banner');

    const resetHeroOffset = () => {
      if (!heroSection) return;
      heroSection.style.marginTop = '';
      heroSection.style.pointerEvents = '';
      heroSection.removeAttribute('data-gh-hero-under-header');
      heroSection.querySelectorAll('[data-gh-hero-interactive]').forEach((el) => {
        el.style.pointerEvents = '';
        el.removeAttribute('data-gh-hero-interactive');
      });
      if (heroBanner) heroBanner.style.marginTop = '';
    };

    if (!isMobile || !heroSection) {
      resetHeroOffset();
      return;
    }

    const headerGroup = document.getElementById('header-group');
    const anchor = mobileShell || mobileBlock || headerGroup;
    if (!anchor) return;

    const anchorBottom = anchor.getBoundingClientRect().bottom;
    const sectionTop = heroSection.getBoundingClientRect().top;
    const gap = Math.round(sectionTop - anchorBottom);

    heroSection.style.marginTop = gap > 0 ? `-${gap}px` : '0';
    if (heroBanner) heroBanner.style.marginTop = '0';

    /* Homepage only: hero overlaps header — disable hero hit targets except CTAs/arrows */
    const isHome =
      document.body.classList.contains('template-index') ||
      document.getElementById('MainContent')?.dataset?.template === 'index';

    if (isHome) {
      heroSection.setAttribute('data-gh-hero-under-header', gap > 0 ? 'true' : 'false');
      heroSection.style.pointerEvents = 'none';
      heroSection
        .querySelectorAll(
          'a, button, input, [data-gh-hero-prev], [data-gh-hero-next], [data-gh-hero-dot], [role="tab"]'
        )
        .forEach((el) => {
          el.setAttribute('data-gh-hero-interactive', '');
          el.style.pointerEvents = 'auto';
        });
    }

    const headerSection = document.querySelector('.header-section.grosyhub-header-section');
    if (isMobile && headerSection instanceof HTMLElement && mobileBlock) {
      headerSection.style.overflow = 'hidden';
    }
  };

  const runLayout = () => {
    setHeights();
    requestAnimationFrame(() => setHeights());
  };

  runLayout();

  let resizeDebounce = null;
  const scheduleSetHeights = () => {
    clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(setHeights, 80);
  };

  if (typeof ResizeObserver !== 'undefined') {
    const section =
      document.querySelector('.header-section.grosyhub-header-section') || header;
    new ResizeObserver(scheduleSetHeights).observe(section);
    if (mobileBlock) new ResizeObserver(scheduleSetHeights).observe(mobileBlock);
    const heroSection = document.querySelector(HOME_HERO_SECTION_SELECTOR);
    if (heroSection) new ResizeObserver(scheduleSetHeights).observe(heroSection);
  } else {
    window.addEventListener('resize', scheduleSetHeights, { passive: true });
  }

  document.addEventListener('gh:hero-banner:mounted', runLayout);
  document.addEventListener('DOMContentLoaded', runLayout);
  window.addEventListener('load', runLayout);

  mqDesktop.addEventListener('change', scheduleSetHeights);

  /* Menu drawer (mobile + desktop) */
  const menuDrawer = document.querySelector('[data-gh-nav-drawer], [data-gh-mobile-drawer]');
  let menuDrawerTrigger = null;

  function closeMenuDrawer() {
    if (!menuDrawer) return;
    menuDrawer.hidden = true;
    document.documentElement.classList.remove('gh-nav-open');
    document.querySelectorAll('[data-gh-nav-toggle]').forEach((btn) => {
      btn.setAttribute('aria-expanded', 'false');
    });
    if (menuDrawerTrigger && typeof menuDrawerTrigger.focus === 'function') {
      menuDrawerTrigger.focus();
    }
    menuDrawerTrigger = null;
  }

  function openMenuDrawer(trigger) {
    if (!menuDrawer) return;
    closeCategoriesDrawer();
    closeSearchOverlay();
    if (typeof closeWishlistDrawer === 'function') closeWishlistDrawer();
    if (window.GhCartDrawer) window.GhCartDrawer.close();
    menuDrawerTrigger = trigger || document.activeElement;
    menuDrawer.hidden = false;
    document.documentElement.classList.add('gh-nav-open');
    document.querySelectorAll('[data-gh-nav-toggle]').forEach((btn) => {
      btn.setAttribute('aria-expanded', 'true');
    });
    const closeBtn = menuDrawer.querySelector('.gh-nav-drawer__close');
    if (closeBtn) setTimeout(() => closeBtn.focus(), 50);
  }

  /* Header icon taps — per-button debounce; bubble phase (no capture stopPropagation) */
  const lastTapByControl = new WeakMap();

  function bindHeaderControls(selector, handler) {
    header.querySelectorAll(selector).forEach((control) => {
      control.addEventListener('click', (e) => {
        const now = Date.now();
        const last = lastTapByControl.get(control) || 0;
        if (now - last < 400) return;
        lastTapByControl.set(control, now);
        handler(control, e);
      });
    });
  }

  bindHeaderControls('[data-gh-nav-toggle]', (btn) => {
    if (menuDrawer && !menuDrawer.hidden) closeMenuDrawer();
    else openMenuDrawer(btn);
  });

  menuDrawer &&
    menuDrawer.querySelectorAll('[data-gh-drawer-close]').forEach((el) => {
      el.addEventListener('click', closeMenuDrawer);
    });

  /* Categories drawer */
  const catDrawer = document.querySelector('[data-gh-categories-drawer]');

  function closeCategoriesDrawer() {
    if (!catDrawer) return;
    catDrawer.hidden = true;
    document.documentElement.classList.remove('gh-categories-open');
  }

  function openCategoriesDrawer() {
    if (!catDrawer) return;
    closeMenuDrawer();
    closeSearchOverlay();
    if (typeof closeMega === 'function') closeMega();
    if (typeof closeWishlistDrawer === 'function') closeWishlistDrawer();
    if (window.GhCartDrawer) window.GhCartDrawer.close();
    catDrawer.hidden = false;
    document.documentElement.classList.add('gh-categories-open');
  }

  document.querySelectorAll('[data-gh-categories-open]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openCategoriesDrawer();
    });
  });

  catDrawer &&
    catDrawer.querySelectorAll('[data-gh-categories-close]').forEach((el) => {
      el.addEventListener('click', closeCategoriesDrawer);
    });

  function toggleDrawerAccordion(btn) {
    const sub =
      (btn.parentElement &&
        btn.parentElement.querySelector('.gh-nav-drawer__sub, .gh-nav-drawer__sub-nested')) ||
      null;
    if (!sub) return;
    const willOpen = sub.hidden;
    sub.hidden = !willOpen;
    btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    btn.classList.toggle('is-open', willOpen);
    if (btn.classList.contains('gh-nav-drawer__sub-toggle')) {
      btn.classList.toggle('is-open', willOpen);
    }
  }

  catDrawer &&
    catDrawer.querySelectorAll('[data-gh-cat-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => toggleDrawerAccordion(btn));
    });

  /* Search overlay */
  const searchOverlay = document.querySelector('[data-gh-search-overlay]');

  function closeSearchOverlay() {
    if (!searchOverlay) return;
    searchOverlay.hidden = true;
    document.documentElement.classList.remove('gh-search-open');
  }

  function openSearchOverlay() {
    if (!searchOverlay) return;
    closeMenuDrawer();
    closeCategoriesDrawer();
    searchOverlay.hidden = false;
    document.documentElement.classList.add('gh-search-open');
    const input = searchOverlay.querySelector('.gh-search__input');
    if (input) setTimeout(() => input.focus(), 100);
  }

  bindHeaderControls('[data-gh-search-open]', () => {
    openSearchOverlay();
  });

  searchOverlay &&
    searchOverlay.querySelectorAll('[data-gh-search-close]').forEach((el) => {
      el.addEventListener('click', closeSearchOverlay);
    });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (megaZone && megaZone.classList.contains('is-mega-open')) closeMega();
    if (menuDrawer && !menuDrawer.hidden) closeMenuDrawer();
    if (catDrawer && !catDrawer.hidden) closeCategoriesDrawer();
    if (searchOverlay && !searchOverlay.hidden) closeSearchOverlay();
    if (typeof closeWishlistDrawer === 'function' && wishlistDrawer && !wishlistDrawer.hidden) closeWishlistDrawer();
    if (window.GhCartDrawer && !document.querySelector('[data-gh-cart-drawer]')?.hidden) window.GhCartDrawer.close();
  });

  /* Menu drawer nested toggles */
  document.querySelectorAll('[data-gh-drawer-toggle], [data-gh-mobile-menu-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => toggleDrawerAccordion(btn));
  });

  /* Mega menu desktop */
  let megaCloseTimer = null;
  const megaZone = header.querySelector('[data-gh-mega-zone]');
  const desktopWrap = header.querySelector('[data-gh-desktop-wrap]');
  const megaBackdrop = header.querySelector('[data-gh-mega-backdrop]');
  const mega = header.querySelector('[data-gh-mega-menu]');
  const categoriesBtn = header.querySelector('[data-gh-mega-trigger]');
  const megaNavTriggers = header.querySelectorAll('[data-gh-mega-trigger-nav]');
  const megaCatBtns = mega ? mega.querySelectorAll('[data-gh-mega-cat]') : [];
  const megaPanes = mega ? mega.querySelectorAll('[data-gh-mega-pane]') : [];

  function setMegaPane(index) {
    if (!mega) return;
    const i = Number(index);
    if (Number.isNaN(i)) return;
    megaCatBtns.forEach((btn) => {
      const active = Number(btn.getAttribute('data-gh-mega-cat')) === i;
      btn.classList.toggle('is-active', active);
    });
    megaPanes.forEach((pane) => {
      const active = Number(pane.getAttribute('data-gh-mega-pane')) === i;
      pane.classList.toggle('is-active', active);
      pane.hidden = !active;
    });
    megaNavTriggers.forEach((link) => {
      const active = Number(link.getAttribute('data-gh-mega-trigger-nav')) === i;
      link.classList.toggle('is-mega-hover', active);
    });
  }

  function openMega(paneIndex) {
    if (!megaZone || !mega || !mqDesktop.matches) return;
    clearTimeout(megaCloseTimer);
    megaZone.classList.add('is-mega-open');
    if (desktopWrap) desktopWrap.classList.add('is-mega-open');
    if (megaBackdrop) megaBackdrop.setAttribute('aria-hidden', 'false');
    if (categoriesBtn) categoriesBtn.setAttribute('aria-expanded', 'true');
    if (paneIndex !== undefined && paneIndex !== null) {
      setMegaPane(paneIndex);
    }
    megaNavTriggers.forEach((link) => {
      const active = paneIndex !== undefined && link.getAttribute('data-gh-mega-trigger-nav') === String(paneIndex);
      link.setAttribute('aria-expanded', active ? 'true' : 'false');
    });
  }

  function closeMega() {
    if (!megaZone) return;
    megaZone.classList.remove('is-mega-open');
    if (desktopWrap) desktopWrap.classList.remove('is-mega-open');
    if (megaBackdrop) megaBackdrop.setAttribute('aria-hidden', 'true');
    if (categoriesBtn) categoriesBtn.setAttribute('aria-expanded', 'false');
    megaNavTriggers.forEach((link) => {
      link.classList.remove('is-mega-hover');
      link.setAttribute('aria-expanded', 'false');
    });
  }

  function scheduleMegaClose() {
    clearTimeout(megaCloseTimer);
    megaCloseTimer = setTimeout(closeMega, 220);
  }

  function isMegaHoverRelated(el) {
    if (!el || !(el instanceof Node)) return false;
    if (megaZone && megaZone.contains(el)) return true;
    if (mega && mega.contains(el)) return true;
    for (let i = 0; i < megaNavTriggers.length; i++) {
      const link = megaNavTriggers[i];
      if (link === el || link.contains(el)) return true;
    }
    return false;
  }

  function onMegaHoverLeave(e) {
    if (isMegaHoverRelated(e.relatedTarget)) return;
    scheduleMegaClose();
  }

  if (megaZone && mega) {
    if (categoriesBtn) {
      categoriesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeMega();
        openCategoriesDrawer();
      });
    }

    mega.addEventListener('mouseenter', () => {
      clearTimeout(megaCloseTimer);
      openMega();
    });
    mega.addEventListener('mouseleave', onMegaHoverLeave);

    if (megaBackdrop) {
      megaBackdrop.addEventListener('click', closeMega);
    }

    megaNavTriggers.forEach((link) => {
      const paneIndex = link.getAttribute('data-gh-mega-trigger-nav');
      const openFromNav = () => openMega(paneIndex);
      link.addEventListener('mouseenter', openFromNav);
      link.addEventListener('focus', openFromNav);
      link.addEventListener('click', (e) => {
        if (mqDesktop.matches) e.preventDefault();
      });
      const li = link.closest('li');
      if (li) {
        li.addEventListener('mouseenter', openFromNav);
      }
    });

    megaCatBtns.forEach((btn) => {
      btn.addEventListener('mouseenter', () => setMegaPane(btn.getAttribute('data-gh-mega-cat')));
      btn.addEventListener('focus', () => setMegaPane(btn.getAttribute('data-gh-mega-cat')));
    });

    if (megaZone) {
      megaZone.addEventListener('mouseleave', onMegaHoverLeave);
    }

    if (desktopWrap) {
      desktopWrap.addEventListener('mouseleave', onMegaHoverLeave);
    }
  }

  /* Wishlist drawer */
  const wishlistDrawer = document.querySelector('[data-gh-wishlist-drawer]');
  const countSelectors = '[data-gh-wishlist-count], [data-gh-wishlist-count-mobile], [data-gh-wishlist-count-bottom]';
  const listEl = wishlistDrawer && wishlistDrawer.querySelector('[data-gh-wishlist-list]');
  const emptyEl = wishlistDrawer && wishlistDrawer.querySelector('[data-gh-wishlist-empty]');
  const footEl = wishlistDrawer && wishlistDrawer.querySelector('[data-gh-wishlist-foot]');
  const totalLabelEl = wishlistDrawer && wishlistDrawer.querySelector('[data-gh-wishlist-total-label]');
  const totalPriceEl = wishlistDrawer && wishlistDrawer.querySelector('[data-gh-wishlist-total-price]');
  const moveAllBtn = wishlistDrawer && wishlistDrawer.querySelector('[data-gh-wishlist-move-all]');
  const wishlistTitleEl = wishlistDrawer && wishlistDrawer.querySelector('[data-gh-wishlist-title]');
  const wishlistBaseHeading =
    (wishlistTitleEl && wishlistTitleEl.textContent.replace(/\s*\(\d+\)\s*$/, '').trim()) || 'My Wishlist';

  function formatMoney(amount) {
    if (amount === '' || amount == null) return '';
    const num = parseFloat(amount);
    if (Number.isNaN(num)) return String(amount);
    if (typeof Shopify !== 'undefined' && Shopify.formatMoney) {
      return Shopify.formatMoney(num);
    }
    return 'Rs. ' + (num / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function wishlistItemsTotalCents(items) {
    return items.reduce((sum, item) => {
      const n = parseFloat(item.price);
      return sum + (Number.isNaN(n) ? 0 : n);
    }, 0);
  }

  function updateWishlistCounts() {
    if (!window.GhWishlist) return;
    const n = window.GhWishlist.getAll().length;
    document.querySelectorAll(countSelectors).forEach((el) => {
      el.textContent = String(n);
      if (n === 0) el.classList.add('gh-badge--empty');
      else el.classList.remove('gh-badge--empty');
    });
  }

  async function addVariantsToCart(variantIds) {
    const items = variantIds.map((id) => ({ id: Number(id), quantity: 1 }));
    const res = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ items }),
    });
    if (!res.ok) throw new Error('Add to cart failed');
    return res.json();
  }

  function renderWishlistDrawer() {
    if (!wishlistDrawer || !listEl || !window.GhWishlist) return;
    const items = window.GhWishlist.getAll();
    listEl.innerHTML = '';
    const hasItems = items.length > 0;
    if (emptyEl) emptyEl.hidden = hasItems;
    if (footEl) footEl.hidden = !hasItems;
    if (moveAllBtn) moveAllBtn.disabled = !hasItems;
    if (wishlistTitleEl) {
      wishlistTitleEl.textContent = wishlistBaseHeading + (hasItems ? ' (' + items.length + ')' : '');
    }
    const totalCents = wishlistItemsTotalCents(items);
    if (totalLabelEl) {
      totalLabelEl.textContent =
        'Total (' + items.length + ' item' + (items.length === 1 ? '' : 's') + ')';
    }
    if (totalPriceEl) {
      totalPriceEl.textContent = formatMoney(totalCents) || 'Rs. 0.00';
    }

    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'gh-wishlist-drawer__item';
      li.innerHTML =
        '<a href="' +
        item.url +
        '" class="gh-wishlist-drawer__item-img">' +
        (item.image
          ? '<img src="' + item.image + '" alt="" width="72" height="72" loading="lazy">'
          : '<span class="gh-wishlist-drawer__item-img-placeholder"></span>') +
        '</a>' +
        '<div class="gh-wishlist-drawer__item-body">' +
        '<a href="' +
        item.url +
        '" class="gh-wishlist-drawer__item-title">' +
        escapeHtml(item.title) +
        '</a>' +
        '<p class="gh-wishlist-drawer__item-price">' +
        escapeHtml(formatMoney(item.price)) +
        '</p>' +
        '<span class="gh-wishlist-drawer__stock">In Stock</span>' +
        '</div>' +
        '<div class="gh-wishlist-drawer__item-actions">' +
        '<button type="button" class="gh-wishlist-drawer__icon-btn gh-wishlist-drawer__icon-btn--heart" aria-label="Saved to wishlist" disabled>' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s-7.5-4.7-9.8-9.4C.4 8.2 2.6 4 6.4 4c2 0 3.2 1.2 3.6 1.8C10.4 5.2 11.6 4 13.6 4c3.8 0 6 4.2 4.2 7.6C19.5 16.3 12 21 12 21z" stroke="currentColor" stroke-width="1.5" fill="currentColor"/></svg>' +
        '</button>' +
        '<button type="button" class="gh-wishlist-drawer__icon-btn gh-wishlist-drawer__icon-btn--remove" data-wishlist-remove="' +
        escapeHtml(item.variantId) +
        '" aria-label="Remove from wishlist">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v12a1 1 0 01-1 1H8a1 1 0 01-1-1V7h14z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
        '</button>' +
        '</div>';
      listEl.appendChild(li);
    });

    listEl.querySelectorAll('[data-wishlist-remove]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.GhWishlist.remove(btn.getAttribute('data-wishlist-remove'));
      });
    });
  }

  function closeWishlistDrawer() {
    if (!wishlistDrawer) return;
    wishlistDrawer.hidden = true;
    document.documentElement.classList.remove('gh-wishlist-open');
  }

  function openWishlistDrawer() {
    if (!wishlistDrawer) return;
    closeMenuDrawer();
    closeCategoriesDrawer();
    closeSearchOverlay();
    if (window.GhCartDrawer) window.GhCartDrawer.close();
    renderWishlistDrawer();
    wishlistDrawer.hidden = false;
    document.documentElement.classList.add('gh-wishlist-open');
  }

  bindHeaderControls('[data-gh-wishlist-open]', () => {
    openWishlistDrawer();
  });

  wishlistDrawer &&
    wishlistDrawer.querySelectorAll('[data-gh-wishlist-close], .gh-drawer__close').forEach((el) => {
      el.addEventListener('click', closeWishlistDrawer);
    });

  if (moveAllBtn) {
    moveAllBtn.addEventListener('click', async () => {
      if (!window.GhWishlist) return;
      const items = window.GhWishlist.getAll();
      if (!items.length) return;
      moveAllBtn.disabled = true;
      try {
        await addVariantsToCart(items.map((i) => i.variantId));
        if (window.GhCartDrawer) {
          await window.GhCartDrawer.refresh();
          window.GhCartDrawer.open();
        }
      } catch (err) {
        console.error(err);
      } finally {
        moveAllBtn.disabled = false;
      }
    });
  }

  function onWishlistChange() {
    updateWishlistCounts();
    if (!wishlistDrawer || wishlistDrawer.hidden) {
      renderWishlistDrawer();
      return;
    }
    renderWishlistDrawer();
  }

  document.addEventListener('gh-wishlist-updated', onWishlistChange);
  document.addEventListener('gh:wishlist:change', onWishlistChange);

  updateWishlistCounts();
  renderWishlistDrawer();

  /* Homepage hero banner mount (v2) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â when live index template is out of sync */
  const mountHomeBanner = () => {
    const main = document.getElementById('MainContent');
    if (!main || main.dataset.template !== 'index') return;
    if (document.querySelector('[id*="grosyhub_hero_slider"], .gh-hero-banner')) return;

    const prefixEl = document.querySelector('[id^="shopify-section-template--"]');
    const prefix = prefixEl?.id.match(/^shopify-section-(template--\d+)__/)?.[1];
    const root = (window.Shopify?.routes?.root || '/').replace(/\/?$/, '/');
    const urls = [];
    if (prefix) urls.push(`${root}?section_id=${prefix}__grosyhub_hero_slider`);
    urls.push(`${root}?sections=grosyhub-hero-slider`);

    const insert = (html) => {
      if (!html || document.querySelector('.gh-hero-banner')) return false;
      const wrap = document.createElement('div');
      wrap.setAttribute('data-gh-banner-mount', '');
      wrap.innerHTML = html;
      wrap.querySelectorAll('script[src]').forEach((old) => {
        const src = old.getAttribute('src');
        if (!src || Array.from(document.scripts).some((s) => s.src === src)) {
          old.remove();
          return;
        }
        const s = document.createElement('script');
        if (old.defer) s.defer = true;
        s.src = src;
        old.remove();
        document.body.appendChild(s);
      });
      main.insertBefore(wrap, main.firstChild);
      return true;
    };

    const tryFetch = (i) => {
      if (i >= urls.length || document.querySelector('.gh-hero-banner')) return;
      fetch(urls[i], { credentials: 'same-origin' })
        .then((res) => (res.ok ? res.json().catch(() => res.text()) : Promise.reject()))
        .then((data) => {
          const html = typeof data === 'string' ? data : data?.['grosyhub-hero-slider'];
          if (!insert(html)) tryFetch(i + 1);
        })
        .catch(() => tryFetch(i + 1));
    };

    tryFetch(0);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountHomeBanner);
  } else {
    mountHomeBanner();
  }
})();