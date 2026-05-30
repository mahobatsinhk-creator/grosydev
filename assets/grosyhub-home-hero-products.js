(function () {
  const addToCart = async (variantId) => {
    const res = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }] }),
    });
    if (!res.ok) throw new Error('Add to cart failed');
    return res.json();
  };

  document.querySelectorAll('[data-gh-hp-add-cart]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-gh-hp-add-cart');
      if (!id) return;
      btn.disabled = true;
      try {
        await addToCart(id);
        if (window.GhCartDrawer) await window.GhCartDrawer.refresh();
        document.dispatchEvent(new CustomEvent('gh:cart:open'));
      } catch (err) {
        console.error(err);
      } finally {
        btn.disabled = false;
      }
    });
  });
})();
