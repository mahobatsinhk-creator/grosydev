(function () {
  const drawer = document.querySelector('[data-gh-cart-drawer]');
  if (!drawer) return;

  const listEl = drawer.querySelector('[data-gh-cart-list]');
  const emptyEl = drawer.querySelector('[data-gh-cart-empty]');
  const summaryEl = drawer.querySelector('[data-gh-cart-summary]');
  const titleEl = drawer.querySelector('[data-gh-cart-title]');
  const shippingWrap = drawer.querySelector('[data-gh-cart-shipping-wrap]');
  const shippingText = drawer.querySelector('[data-gh-cart-shipping-text]');
  const shippingFill = drawer.querySelector('[data-gh-cart-shipping-fill]');
  const threshold = Number(drawer.dataset.freeShippingThreshold) || 49900;

  const baseHeading =
    titleEl?.textContent?.replace(/\s*\(\d+\)\s*$/, '').trim() || 'Your Cart';

  function formatMoney(cents) {
    const amount = Number(cents) || 0;
    if (typeof Shopify !== 'undefined' && Shopify.formatMoney) {
      return Shopify.formatMoney(amount);
    }
    return (
      'Rs. ' +
      (amount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function itemQuantity(item) {
    return Math.max(1, Number(item.quantity) || 1);
  }

  /** Line totals in cents — keeps display and savings aligned when qty > 1 */
  function itemLineFinal(item) {
    const qty = itemQuantity(item);
    if (item.final_line_price != null) return Number(item.final_line_price) || 0;
    return (Number(item.final_price) || 0) * qty;
  }

  function itemLineOriginal(item) {
    const qty = itemQuantity(item);
    if (item.original_line_price != null) return Number(item.original_line_price) || 0;
    return (Number(item.original_price) || Number(item.final_price) || 0) * qty;
  }

  function itemLineSaved(item) {
    return Math.max(0, itemLineOriginal(item) - itemLineFinal(item));
  }

  function updateCartBadges(count) {
    document.querySelectorAll('[data-gh-cart-count]').forEach((el) => {
      el.textContent = String(count);
      el.hidden = false;
      el.classList.toggle('gh-badge--empty', count < 1);
    });
  }

  function dispatchCartChange(cart) {
    document.dispatchEvent(new CustomEvent('gh:cart:change', { detail: { cart } }));
    updateCartBadges(cart?.item_count ?? 0);
  }

  async function fetchCart() {
    const res = await fetch('/cart.js', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Cart fetch failed');
    return res.json();
  }

  async function changeLine(key, quantity) {
    const res = await fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ id: key, quantity }),
    });
    if (!res.ok) throw new Error('Cart update failed');
    return res.json();
  }

  function updateShippingBar(cart) {
    if (!shippingWrap || !shippingText || !shippingFill) return;
    if (!cart || cart.item_count < 1) {
      shippingWrap.hidden = true;
      return;
    }
    shippingWrap.hidden = false;
    const subtotal = cart.items_subtotal_price || 0;
    const remaining = Math.max(0, threshold - subtotal);
    const progress = Math.min(100, (subtotal / threshold) * 100);

    if (remaining <= 0) {
      shippingText.innerHTML =
        'You qualify for <strong>FREE shipping</strong>!';
    } else {
      shippingText.innerHTML =
        'Add <strong>' +
        formatMoney(remaining) +
        '</strong> more to unlock FREE shipping!';
    }
    shippingFill.style.width = progress + '%';
  }

  function renderCart(cart) {
    if (!listEl) return;
    listEl.innerHTML = '';
    const count = cart?.item_count ?? 0;

    if (titleEl) titleEl.textContent = baseHeading + (count > 0 ? ' (' + count + ')' : '');

    if (emptyEl) emptyEl.hidden = count > 0;
    if (summaryEl) summaryEl.hidden = count < 1;

    updateShippingBar(cart);

    if (count < 1) return;

    cart.items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'gh-cart-drawer__item';
      const variantLabel =
        item.variant_title && item.variant_title !== 'Default Title' ? item.variant_title : '';
      li.innerHTML =
        '<a href="' +
        item.url +
        '" class="gh-cart-drawer__item-img">' +
        (item.image
          ? '<img src="' + item.image + '" alt="" width="80" height="80" loading="lazy">'
          : '<span class="gh-cart-drawer__item-img-placeholder"></span>') +
        '</a>' +
        '<div class="gh-cart-drawer__item-info">' +
        '<a href="' +
        item.url +
        '" class="gh-cart-drawer__item-title">' +
        escapeHtml(item.product_title) +
        '</a>' +
        (variantLabel
          ? '<p class="gh-cart-drawer__item-variant">' + escapeHtml(variantLabel) + '</p>'
          : '') +
        '<p class="gh-cart-drawer__item-price">' +
        formatMoney(itemLineFinal(item)) +
        '</p>' +
        '<div class="gh-cart-drawer__qty">' +
        '<button type="button" data-cart-qty-minus="' +
        escapeHtml(item.key) +
        '" aria-label="Decrease quantity">−</button>' +
        '<span>' +
        item.quantity +
        '</span>' +
        '<button type="button" data-cart-qty-plus="' +
        escapeHtml(item.key) +
        '" aria-label="Increase quantity">+</button>' +
        '</div></div>' +
        '<button type="button" class="gh-cart-drawer__item-remove" data-cart-remove="' +
        escapeHtml(item.key) +
        '" aria-label="Remove item">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v12a1 1 0 01-1 1H8a1 1 0 01-1-1V7h14z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
        '</button>';
      listEl.appendChild(li);
    });

    const subtotalEl = drawer.querySelector('[data-gh-cart-subtotal]');
    const totalEl = drawer.querySelector('[data-gh-cart-total]');
    const saveEl = drawer.querySelector('[data-gh-cart-save]');
    const saveRow = drawer.querySelector('[data-gh-cart-save-row]');
    const shippingLabel = drawer.querySelector('[data-gh-cart-shipping-label]');

    if (subtotalEl) subtotalEl.textContent = formatMoney(cart.items_subtotal_price);
    if (totalEl) totalEl.textContent = formatMoney(cart.total_price);

    let saved = 0;
    cart.items.forEach((item) => {
      saved += itemLineSaved(item);
    });
    if (saveRow && saveEl) {
      if (saved > 0) {
        saveRow.hidden = false;
        saveEl.textContent = formatMoney(saved);
      } else {
        saveRow.hidden = true;
      }
    }

    if (shippingLabel) {
      const free = (cart.items_subtotal_price || 0) >= threshold;
      shippingLabel.textContent = free ? 'FREE' : '—';
      shippingLabel.classList.toggle('gh-cart-drawer__free', free);
    }

    listEl.querySelectorAll('[data-cart-remove]').forEach((btn) => {
      btn.addEventListener('click', () => handleQty(btn.getAttribute('data-cart-remove'), 0));
    });
    listEl.querySelectorAll('[data-cart-qty-minus]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-cart-qty-minus');
        const item = cart.items.find((i) => i.key === key);
        if (item) handleQty(key, item.quantity - 1);
      });
    });
    listEl.querySelectorAll('[data-cart-qty-plus]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-cart-qty-plus');
        const item = cart.items.find((i) => i.key === key);
        if (item) handleQty(key, item.quantity + 1);
      });
    });
  }

  async function handleQty(key, quantity) {
    try {
      const cart = await changeLine(key, Math.max(0, quantity));
      renderCart(cart);
      dispatchCartChange(cart);
    } catch (e) {
      console.error(e);
    }
  }

  async function refresh() {
    try {
      const cart = await fetchCart();
      renderCart(cart);
      dispatchCartChange(cart);
      return cart;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  function openDrawer() {
    drawer.hidden = false;
    document.documentElement.classList.add('gh-cart-open');
    refresh();
  }

  function closeDrawer() {
    drawer.hidden = true;
    document.documentElement.classList.remove('gh-cart-open');
  }

  document.querySelectorAll('[data-gh-cart-open]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('gh:cart:open'));
    });
  });

  drawer.querySelectorAll('[data-gh-cart-close]').forEach((el) => {
    el.addEventListener('click', closeDrawer);
  });

  document.addEventListener('gh:cart:open', openDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden) closeDrawer();
  });

  window.GhCartDrawer = { open: openDrawer, close: closeDrawer, refresh };

  document.addEventListener('cart:update', () => refresh());

  refresh();
})();
