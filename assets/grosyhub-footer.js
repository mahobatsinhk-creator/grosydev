(function () {
  const mqFooterDesktop = window.matchMedia('(min-width: 750px)');

  const setAccordionOpen = (col, open) => {
    col.classList.toggle('is-open', open);
    const btn = col.querySelector('[data-gh-footer-accordion]');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  document.querySelectorAll('[data-gh-footer-accordion]').forEach((btn) => {
    const col = btn.closest('.gh-footer__col--accordion');
    if (!col) return;

    btn.addEventListener('click', () => {
      if (mqFooterDesktop.matches) return;
      setAccordionOpen(col, !col.classList.contains('is-open'));
    });
  });

  const syncFooterAccordionA11y = () => {
    document.querySelectorAll('.gh-footer__col--accordion').forEach((col) => {
      const btn = col.querySelector('[data-gh-footer-accordion]');
      if (mqFooterDesktop.matches) {
        col.classList.remove('is-open');
        if (btn) {
          btn.setAttribute('aria-expanded', 'true');
          btn.setAttribute('aria-hidden', 'true');
        }
      } else {
        if (btn) {
          btn.removeAttribute('aria-hidden');
          setAccordionOpen(col, col.classList.contains('is-open'));
        }
      }
    });
  };

  syncFooterAccordionA11y();
  mqFooterDesktop.addEventListener('change', syncFooterAccordionA11y);
})();
