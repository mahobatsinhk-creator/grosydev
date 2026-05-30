(function () {
  const initContactPage = (root) => {
    const message = root.querySelector('[data-gh-contact-message]');
    const counter = root.querySelector('[data-gh-contact-char-count]');
    const maxLen = message ? parseInt(message.getAttribute('maxlength') || '500', 10) : 500;

    if (message && counter) {
      const updateCount = () => {
        counter.textContent = String(message.value.length);
      };
      message.addEventListener('input', updateCount);
      updateCount();
    }

    root.querySelectorAll('[data-gh-contact-faq]').forEach((btn) => {
      const panelId = btn.getAttribute('aria-controls');
      const panel = panelId ? document.getElementById(panelId) : null;
      if (!panel) return;

      btn.addEventListener('click', () => {
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        panel.hidden = expanded;
      });
    });
  };

  document.querySelectorAll('[data-gh-contact-page]').forEach(initContactPage);
})();
