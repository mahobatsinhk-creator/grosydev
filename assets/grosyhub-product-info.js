/**
 * Grosyhub PDP — pack selection, add to cart (header + drawer), buy now.
 */
(function () {
  const formatMoney = (cents, format, currency) => {
    if (cents == null || !format) return '';
    const amount = (cents / 100).toFixed(2);
    let result = format.replace(/\{\{\s*amount_no_decimals\s*\}\}/g, Math.round(cents / 100).toString());
    result = result.replace(/\{\{\s*amount\s*\}\}/g, amount);
    if (currency && result.includes('{{')) {
      result = result.replace(/\{\{\s*currency\s*\}\}/g, currency);
    }
    return result;
  };

  const updatePdpPrice = (pdp, variant) => {
    if (!pdp || !variant) return;

    const priceRoot = pdp.querySelector('[data-gh-pdp-price]');
    if (!priceRoot) return;

    const format = pdp.dataset.moneyFormat || '{{ amount }}';
    const currency = pdp.dataset.currency || '';

    const priceEl = priceRoot.querySelector('[data-gh-price]');
    const compareEl = priceRoot.querySelector('[data-gh-compare]');
    const saveEl = priceRoot.querySelector('[data-gh-save]');
    const input = pdp.querySelector('[data-gh-variant-input]');

    if (input && variant.id) {
      input.value = variant.id;
    }

    if (priceEl) {
      priceEl.textContent = formatMoney(variant.price, format, currency);
    }

    const onSale = variant.compare_at_price && variant.compare_at_price > variant.price;
    if (compareEl) {
      compareEl.textContent = onSale ? formatMoney(variant.compare_at_price, format, currency) : '';
      compareEl.hidden = !onSale;
    }

    if (saveEl) {
      if (onSale) {
        const saved = variant.compare_at_price - variant.price;
        const savedText = formatMoney(saved, format, currency);
        saveEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4h10l1 4H6l1-4zm-1 6h12l-1 10H7L6 10z" stroke="currentColor" stroke-width="1.4"/></svg> ${savedText} Save`;
        saveEl.hidden = false;
      } else {
        saveEl.hidden = true;
      }
    }
  };

  document.addEventListener('variant:update', (event) => {
    const { resource, data } = event.detail || {};
    if (!resource) return;

    document.querySelectorAll('.gh-pdp-info').forEach((pdp) => {
      if (data?.productId && pdp.dataset.productId !== String(data.productId)) return;
      updatePdpPrice(pdp, resource);
    });
  });

  const syncPackToForm = (pdp) => {
    if (!pdp) return { variantId: null, quantity: 1 };

    const form = pdp.querySelector('form');
    const packPicker = pdp.querySelector('[data-gh-pack-picker]');
    const packInput = packPicker?.querySelector('[data-gh-pack-input]:checked');
    const variantInput = form?.querySelector('[name="id"], [data-gh-variant-input]');
    const qtyInput = form?.querySelector('input[name="quantity"]');
    const qtyComponent = pdp.querySelector('quantity-selector-component');

    let quantity = 1;
    let variantId = variantInput?.value || null;

    if (packInput) {
      if (packInput.dataset.variantId) {
        variantId = packInput.dataset.variantId;
      }
      if (packInput.dataset.quantity) {
        quantity = parseInt(packInput.dataset.quantity, 10) || 1;
      }
    } else if (qtyComponent?.getValue) {
      quantity = Number(qtyComponent.getValue()) || 1;
    } else if (qtyInput) {
      quantity = parseInt(qtyInput.value, 10) || 1;
    }

    if (variantInput && variantId) {
      variantInput.value = variantId;
    }
    if (qtyInput) {
      qtyInput.value = String(quantity);
    }
    if (qtyComponent?.setValue) {
      qtyComponent.setValue(quantity);
    } else if (qtyComponent?.refs?.quantityInput) {
      qtyComponent.refs.quantityInput.value = String(quantity);
    }

    return { variantId, quantity, form };
  };

  const setButtonLoading = (btn, loading) => {
    if (!btn) return;
    btn.classList.toggle('is-loading', loading);
    btn.disabled = loading;
  };

  const addToCart = async (variantId, quantity) => {
    const res = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ items: [{ id: Number(variantId), quantity: Number(quantity) }] }),
    });

    const data = await res.json();
    if (!res.ok || data.status) {
      throw new Error(data.description || data.message || 'Could not add to cart');
    }
    return data;
  };

  const refreshCartUI = async () => {
    if (window.GhCartDrawer?.refresh) {
      return window.GhCartDrawer.refresh();
    }

    const res = await fetch('/cart.js', { credentials: 'same-origin' });
    if (!res.ok) return null;
    const cart = await res.json();
    const count = cart?.item_count ?? 0;
    document.querySelectorAll('[data-gh-cart-count]').forEach((el) => {
      el.textContent = String(count);
      el.hidden = false;
      el.classList.toggle('gh-badge--empty', count < 1);
    });
    document.dispatchEvent(new CustomEvent('gh:cart:change', { detail: { cart } }));
    document.dispatchEvent(new CustomEvent('cart:update', { bubbles: true, detail: { resource: cart } }));
    return cart;
  };

  const pdpAddToCart = async (pdp, { openDrawer = true, trigger } = {}) => {
    const { variantId, quantity } = syncPackToForm(pdp);
    if (!variantId) return false;

    setButtonLoading(trigger, true);

    try {
      await addToCart(variantId, quantity);
      await refreshCartUI();
      if (openDrawer) {
        document.dispatchEvent(new CustomEvent('gh:cart:open'));
      }
      return true;
    } catch (err) {
      console.error('[Grosyhub PDP]', err);
      window.alert(err.message || 'Could not add to cart. Please try again.');
      return false;
    } finally {
      setButtonLoading(trigger, false);
    }
  };

  const initPdp = (pdp) => {
    if (!pdp || pdp.dataset.ghPdpCartReady === 'true') return;
    pdp.dataset.ghPdpCartReady = 'true';

    const form = pdp.querySelector('form');
    const addBtn = pdp.querySelector('[data-gh-pdp-add-cart]');
    const buyNowBtn = pdp.querySelector('[data-gh-buy-now]');
    const packPicker = pdp.querySelector('[data-gh-pack-picker]');

    if (addBtn) {
      addBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (addBtn.disabled) return;
        pdpAddToCart(pdp, { openDrawer: true, trigger: addBtn });
      });
    }

    if (packPicker) {
      packPicker.querySelectorAll('[data-gh-pack-add]').forEach((label) => {
        label.addEventListener('click', () => {
          const inputId = label.getAttribute('for');
          const input = inputId ? document.getElementById(inputId) : null;
          if (!input || input.disabled) return;

          window.setTimeout(() => {
            pdpAddToCart(pdp, { openDrawer: true, trigger: label });
          }, 0);
        });
      });
    }

    if (buyNowBtn) {
      buyNowBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (buyNowBtn.disabled || buyNowBtn.classList.contains('is-disabled')) return;

        setButtonLoading(buyNowBtn, true);
        const ok = await pdpAddToCart(pdp, { openDrawer: false, trigger: buyNowBtn });
        if (ok) {
          const checkout =
            typeof Theme !== 'undefined' && Theme.routes?.cart_url
              ? `${Theme.routes.cart_url}/checkout`
              : '/checkout';
          window.location.href = checkout;
        } else {
          setButtonLoading(buyNowBtn, false);
        }
      });
    }

    if (form) {
      form.addEventListener(
        'submit',
        (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (addBtn && !addBtn.disabled) {
            pdpAddToCart(pdp, { openDrawer: true, trigger: addBtn });
          }
        },
        true
      );
    }
  };

  const initAll = () => {
    document.querySelectorAll('.gh-pdp-info').forEach(initPdp);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  document.addEventListener('shopify:section:load', initAll);
})();
