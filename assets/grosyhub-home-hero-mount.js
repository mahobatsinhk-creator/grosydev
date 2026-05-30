/**
 * Ensures Hero Products appears below Shop by Reels when the published homepage
 * is out of sync with theme files (common after CLI pushes to a live theme).
 */
(function () {
  const HERO_SECTION_SELECTOR =
    '[id*="grosyhub_home_hero_products"], .grosyhub-hero-products-section, .gh-hp';

  function heroExists() {
    return Boolean(document.querySelector(HERO_SECTION_SELECTOR));
  }

  function findReelsSection() {
    return (
      document.querySelector('[id*="grosyhub_home_reels"]') ||
      document.querySelector('.grosyhub-home-reels-section')
    );
  }

  function getOrCreateSlot() {
    let slot = document.querySelector('[data-gh-hero-mount]');
    if (slot) return slot;

    const reels = findReelsSection();
    if (!reels) return null;

    slot = document.createElement('div');
    slot.setAttribute('data-gh-hero-mount', '');
    slot.className = 'gh-reels__hero-mount';
    reels.insertAdjacentElement('afterend', slot);
    return slot;
  }

  function loadScripts(container) {
    container.querySelectorAll('script[src]').forEach((old) => {
      const src = old.getAttribute('src');
      const alreadyLoaded = Array.from(document.scripts).some((s) => s.src === src);
      if (!src || alreadyLoaded) {
        old.remove();
        return;
      }
      const script = document.createElement('script');
      if (old.defer) script.defer = true;
      script.src = src;
      old.remove();
      document.body.appendChild(script);
    });
  }

  function mountHero() {
    if (heroExists()) return;

    const slot = getOrCreateSlot();
    if (!slot || slot.dataset.ghHeroLoaded === 'true') return;

    const root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
    const url = root + (root.endsWith('/') ? '' : '/') + '?section_id=grosyhub-home-hero-products';

    fetch(url)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error('section fetch failed'))))
      .then((html) => {
        if (heroExists()) return;
        slot.dataset.ghHeroLoaded = 'true';
        slot.innerHTML = html;
        loadScripts(slot);
        document.dispatchEvent(new CustomEvent('gh:hero-products:mounted'));
      })
      .catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountHero);
  } else {
    mountHero();
  }
})();
