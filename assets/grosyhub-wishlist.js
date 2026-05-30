(function () {
  const STORAGE_KEY = 'gh_wishlist';

  function read() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function write(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      /* ignore */
    }
    document.dispatchEvent(new CustomEvent('gh:wishlist:change', { detail: { items: list } }));
    document.dispatchEvent(new CustomEvent('gh-wishlist-updated', { detail: { items: list } }));
  }

  function normalize(item) {
    if (!item || !item.variantId) return null;
    return {
      variantId: String(item.variantId),
      productId: String(item.productId || ''),
      title: String(item.title || ''),
      url: String(item.url || '/'),
      image: String(item.image || ''),
      price: String(item.price || ''),
      compareAtPrice: String(item.compareAtPrice || ''),
    };
  }

  const GhWishlist = {
    getAll() {
      return read();
    },
    count() {
      return read().length;
    },
    has(variantId) {
      const id = String(variantId);
      return read().some((item) => item.variantId === id);
    },
    add(item) {
      const normalized = normalize(item);
      if (!normalized) return false;
      const list = read().filter((i) => i.variantId !== normalized.variantId);
      list.unshift(normalized);
      write(list);
      return true;
    },
    remove(variantId) {
      const id = String(variantId);
      const list = read().filter((item) => item.variantId !== id);
      write(list);
    },
    toggle(item) {
      const id = String(item.variantId);
      if (this.has(id)) {
        this.remove(id);
        return false;
      }
      this.add(item);
      return true;
    },
    parseFromElement(el) {
      if (!el) return null;
      return normalize({
        variantId: el.dataset.wishlistVariantId,
        productId: el.dataset.wishlistProductId,
        title: el.dataset.wishlistTitle,
        url: el.dataset.wishlistUrl,
        image: el.dataset.wishlistImage,
        price: el.dataset.wishlistPrice,
        compareAtPrice: el.dataset.wishlistCompareAt,
      });
    },
  };

  window.GhWishlist = GhWishlist;

  function syncToggleButtons() {
    document.querySelectorAll('[data-gh-wishlist-toggle]').forEach((btn) => {
      const id = btn.dataset.wishlistVariantId;
      btn.classList.toggle('is-active', GhWishlist.has(id));
      btn.setAttribute('aria-pressed', GhWishlist.has(id) ? 'true' : 'false');
    });
  }

  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-gh-wishlist-toggle]');
    if (!toggle) return;
    e.preventDefault();
    e.stopPropagation();
    const item = GhWishlist.parseFromElement(toggle);
    if (!item) return;
    GhWishlist.toggle(item);
    syncToggleButtons();
  });

  document.addEventListener('gh:wishlist:change', syncToggleButtons);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncToggleButtons);
  } else {
    syncToggleButtons();
  }
})();
