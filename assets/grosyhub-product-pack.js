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

  const dispatchVariantUpdate = (variant, productId) => {
    if (!variant) return;
    document.dispatchEvent(
      new CustomEvent('variant:update', {
        bubbles: true,
        detail: {
          resource: variant,
          data: { productId: String(productId) },
        },
      })
    );
  };

  const getVariants = (info) => {
    const script = info.querySelector('[data-gh-product-variants]');
    if (!script) return [];
    try {
      return JSON.parse(script.textContent);
    } catch {
      return [];
    }
  };

  const updatePackLabels = (packPicker, variant) => {
    if (!packPicker || !variant) return;

    const info = packPicker.closest('.gh-pdp-info');
    const format = info?.dataset.moneyFormat || '{{ amount }}';
    const currency = info?.dataset.currency || '';
    const discountCents = parseInt(packPicker.dataset.ghPackDiscountCents, 10) || 10000;
    const discountInr = Math.round(discountCents / 100);

    const label1 = packPicker.querySelector('[data-gh-pack-label="1"]');
    const label2 = packPicker.querySelector('[data-gh-pack-label="2"]');
    const unitPrice = variant.price;

    if (label1) {
      label1.textContent = `Buy 1 at ${formatMoney(unitPrice, format, currency)}`;
    }

    if (label2) {
      const bundleTotal = Math.max(0, unitPrice * 2 - discountCents);
      label2.textContent = `Buy 2 at ${formatMoney(bundleTotal, format, currency)} (₹${discountInr} Off)`;
    }

    packPicker.querySelectorAll('[data-gh-pack-input]').forEach((input) => {
      input.dataset.variantId = String(variant.id);
      input.value = String(variant.id);
    });
  };

  const applyPackSelection = (packPicker) => {
    const info = packPicker.closest('.gh-pdp-info');
    if (!info) return;

    const packInput = packPicker.querySelector('[data-gh-pack-input]:checked');
    if (!packInput || packInput.disabled) return;

    const hiddenInput = info.querySelector('[data-gh-variant-input]');
    const productId = info.dataset.productId;
    const variants = getVariants(info);

    if (packInput.dataset.quantity) {
      const qtyInput = info.querySelector('input[name="quantity"]');
      if (qtyInput) qtyInput.value = packInput.dataset.quantity;
    }

    if (packInput.dataset.variantId && hiddenInput) {
      const variant = variants.find((v) => String(v.id) === String(packInput.dataset.variantId));
      if (variant) {
        hiddenInput.value = variant.id;
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
        dispatchVariantUpdate(variant, productId);
      }
    }
  };

  const initPackPicker = (packPicker) => {
    const info = packPicker.closest('.gh-pdp-info');
    const variants = getVariants(info);
    const hiddenInput = info?.querySelector('[data-gh-variant-input]');
    const current =
      variants.find((v) => String(v.id) === String(hiddenInput?.value)) ||
      variants.find((v) => v.available) ||
      variants[0];

    if (current) updatePackLabels(packPicker, current);

    packPicker.querySelectorAll('[data-gh-pack-input]').forEach((input) => {
      input.addEventListener('change', () => applyPackSelection(packPicker));
    });
    applyPackSelection(packPicker);
  };

  const init = () => {
    document.querySelectorAll('[data-gh-pack-picker]').forEach(initPackPicker);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('variant:update', (event) => {
    const { resource, data } = event.detail || {};
    if (!resource) return;

    document.querySelectorAll('[data-gh-pack-picker]').forEach((packPicker) => {
      const info = packPicker.closest('.gh-pdp-info');
      if (data?.productId && info?.dataset.productId !== String(data.productId)) return;
      updatePackLabels(packPicker, resource);
    });
  });

  document.querySelectorAll('[data-gh-promo-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const promo = btn.closest('[data-gh-promo]');
      if (promo) promo.hidden = true;
    });
  });
})();
