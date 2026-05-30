/**
 * Mounts the homepage hero banner when the live published index template
 * is out of sync with theme files (after CLI pushes).
 */
(function () {
  const BANNER_SELECTOR = '[id*="grosyhub_hero_slider"], .gh-hero-banner';

  const isHomepage = () => {
    const main = document.getElementById('MainContent');
    if (main?.dataset?.template === 'index') return true;
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    return path === '/' || path === '/index';
  };

  const bannerExists = () => Boolean(document.querySelector(BANNER_SELECTOR));

  const getTemplatePrefix = () => {
    const el = document.querySelector('[id^="shopify-section-template--"]');
    if (!el) return null;
    const match = el.id.match(/^shopify-section-(template--\d+)__/);
    return match ? match[1] : null;
  };

  const loadScripts = (container) => {
    container.querySelectorAll('script[src]').forEach((old) => {
      const src = old.getAttribute('src');
      if (!src) {
        old.remove();
        return;
      }
      const exists = Array.from(document.scripts).some((s) => s.src === src);
      if (exists) {
        old.remove();
        return;
      }
      const script = document.createElement('script');
      if (old.defer) script.defer = true;
      script.src = src;
      old.remove();
      document.body.appendChild(script);
    });
  };

  const mountBanner = () => {
    if (!isHomepage() || bannerExists()) return;

    const prefix = getTemplatePrefix();
    const root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
    const base = root.endsWith('/') ? root : `${root}/`;

    const tryUrls = [];
    if (prefix) {
      tryUrls.push(`${base}?section_id=${prefix}__grosyhub_hero_slider`);
    }
    tryUrls.push(`${base}?sections=grosyhub-hero-slider`);

    const insertBanner = (html) => {
      if (!html || bannerExists()) return false;

      const main = document.getElementById('MainContent');
      if (!main) return false;

      const wrap = document.createElement('div');
      wrap.setAttribute('data-gh-banner-mount', '');
      wrap.innerHTML = html;
      loadScripts(wrap);
      main.insertBefore(wrap, main.firstChild);
      document.dispatchEvent(new CustomEvent('gh:hero-banner:mounted'));
      return true;
    };

    const fetchNext = (index) => {
      if (index >= tryUrls.length || bannerExists()) return;

      fetch(tryUrls[index], { credentials: 'same-origin' })
        .then((res) => (res.ok ? res.json().catch(() => res.text()) : Promise.reject()))
        .then((data) => {
          let html = '';
          if (typeof data === 'string') {
            html = data;
          } else if (data && data['grosyhub-hero-slider']) {
            html = data['grosyhub-hero-slider'];
          }
          if (insertBanner(html)) return;
          fetchNext(index + 1);
        })
        .catch(() => fetchNext(index + 1));
    };

    fetchNext(0);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountBanner);
  } else {
    mountBanner();
  }
})();
