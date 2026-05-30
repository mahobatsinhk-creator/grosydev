(function () {
  const STORAGE_PREFIX = 'gh_product_reviews_';

  function getInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
  }

  function deriveTitle(body) {
    const text = String(body || '').trim();
    if (!text) return 'Customer review';
    const sentence = text.split(/[.!?]/)[0].trim();
    const base = sentence || text;
    return base.length > 60 ? base.slice(0, 57) + '...' : base;
  }

  function loadStored(productId) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + productId);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveStored(productId, reviews) {
    try {
      localStorage.setItem(STORAGE_PREFIX + productId, JSON.stringify(reviews));
    } catch (e) {
      /* quota exceeded — skip persist */
    }
  }

  function starSvg(size, filled) {
    const fill = filled ? 'currentColor' : 'none';
    return (
      '<svg width="' +
      size +
      '" height="' +
      size +
      '" viewBox="0 0 24 24" fill="' +
      fill +
      '" stroke="currentColor" stroke-width="1.2" aria-hidden="true">' +
      '<path d="M12 2l2.9 6.1 6.8.6-5.1 4.4 1.6 6.6L12 16.9l-6.2 3.8 1.6-6.6-5.1-4.4 6.8-.6L12 2z"/>' +
      '</svg>'
    );
  }

  function buildReviewHtml(review) {
    const rating = parseInt(review.rating, 10) || 5;
    const stars = Array.from({ length: 5 }, (_, i) => starSvg(16, i < rating)).join('');
    const photos =
      review.photos && review.photos.length
        ? '<div class="gh-reviews__item-photos">' +
          review.photos
            .map(function (src) {
              return '<img src="' + src + '" alt="" loading="lazy" width="72" height="72">';
            })
            .join('') +
          '</div>'
        : '';

    return (
      '<article class="gh-reviews__item gh-reviews__item--submitted" data-gh-review-item data-review-id="' +
      escapeHtml(review.id || '') +
      '" data-rating="' +
      rating +
      '" data-submitted="true">' +
      '<div class="gh-reviews__item-meta">' +
      '<span class="gh-reviews__avatar" aria-hidden="true">' +
      (review.initials || getInitials(review.author)) +
      '</span>' +
      '<div class="gh-reviews__item-author">' +
      '<p class="gh-reviews__name">' +
      escapeHtml(review.author) +
      '</p>' +
      (review.verified
        ? '<p class="gh-reviews__verified"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/><path d="M8 12l2.5 2.5L16 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>Verified purchase</p>'
        : '') +
      '<p class="gh-reviews__date">' +
      escapeHtml(review.date_label || 'Just now') +
      '</p>' +
      '</div></div>' +
      '<div class="gh-reviews__item-content">' +
      '<span class="gh-reviews__item-stars">' +
      stars +
      '</span>' +
      '<h3 class="gh-reviews__item-title">' +
      escapeHtml(review.title || deriveTitle(review.body)) +
      '</h3>' +
      '<p class="gh-reviews__item-body">' +
      escapeHtml(review.body) +
      '</p>' +
      photos +
      '</div></article>'
    );
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function initReviews(root) {
    if (!root || root.dataset.ghReviewsInit === 'true') return;
    root.dataset.ghReviewsInit = 'true';

    const productId = root.dataset.productId;
    const list = root.querySelector('[data-gh-reviews-list]');
    const perPage = parseInt(root.dataset.perPage || '5', 10);
    const pagination = root.querySelector('[data-gh-reviews-pagination]');
    const filterBtn = root.querySelector('[data-gh-reviews-filter]');
    const filterMenu = root.querySelector('[data-gh-reviews-filter-menu]');
    const countEl = root.querySelector('[data-gh-reviews-count]');
    const emptyEl = root.querySelector('[data-gh-reviews-empty]');
    const modal = root.querySelector('[data-gh-review-modal]');
    const writeBtn = root.querySelector('[data-gh-review-write]');
    const form = root.querySelector('[data-gh-review-form]');

    let items = [];
    let activeFilter = 'all';
    let currentPage = 1;

    function refreshItems() {
      items = Array.from(root.querySelectorAll('[data-gh-review-item]'));
    }

    function updateCount() {
      if (!countEl) return;
      const base = parseInt(root.dataset.reviewsBase || '0', 10);
      const submitted = items.filter((el) => el.dataset.submitted === 'true').length;
      const total = base + submitted;
      countEl.textContent = total + ' reviews';
    }

    function filteredItems() {
      if (activeFilter === 'all') return items;
      const star = parseInt(activeFilter, 10);
      return items.filter((el) => parseInt(el.dataset.rating || '0', 10) === star);
    }

    function totalPages() {
      return Math.max(1, Math.ceil(filteredItems().length / perPage));
    }

    function renderPage(page) {
      const visible = filteredItems();
      const pages = totalPages();
      currentPage = Math.min(Math.max(1, page), pages);

      items.forEach((el) => {
        el.hidden = true;
      });

      const start = (currentPage - 1) * perPage;
      visible.slice(start, start + perPage).forEach((el) => {
        el.hidden = false;
      });

      if (pagination) {
        pagination.hidden = pages <= 1 && visible.length <= perPage;
        pagination.innerHTML = '';

        for (let i = 1; i <= pages; i += 1) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'gh-reviews__page' + (i === currentPage ? ' is-active' : '');
          btn.textContent = String(i);
          btn.setAttribute('aria-label', 'Page ' + i);
          if (i === currentPage) btn.setAttribute('aria-current', 'page');
          btn.addEventListener('click', () => renderPage(i));
          pagination.appendChild(btn);
        }

        if (currentPage < pages) {
          const next = document.createElement('button');
          next.type = 'button';
          next.className = 'gh-reviews__page gh-reviews__page--next';
          next.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
          next.setAttribute('aria-label', 'Next page');
          next.addEventListener('click', () => renderPage(currentPage + 1));
          pagination.appendChild(next);
        }
      }

      if (emptyEl) emptyEl.hidden = items.length > 0;
    }

    function prependReview(review) {
      if (!list) return;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = buildReviewHtml(review);
      const article = wrapper.firstElementChild;
      list.insertBefore(article, list.firstChild);
      refreshItems();
      updateCount();
      activeFilter = 'all';
      renderPage(1);
    }

    function injectStoredReviews() {
      if (!productId || !list) return;
      const stored = loadStored(productId);
      stored.forEach((review) => {
        if (review.id && list.querySelector('[data-review-id="' + review.id + '"]')) return;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = buildReviewHtml(review);
        list.insertBefore(wrapper.firstElementChild, list.firstChild);
      });
    }

    /* Modal */
    function openModal() {
      if (!modal) return;
      modal.hidden = false;
      document.body.classList.add('gh-review-modal-open');
      const firstInput = modal.querySelector('[data-gh-review-body]');
      if (firstInput) setTimeout(() => firstInput.focus(), 50);
    }

    function closeModal() {
      if (!modal) return;
      modal.hidden = true;
      document.body.classList.remove('gh-review-modal-open');
    }

    function initModal() {
      if (!modal || !form) return;

      const ratingInput = form.querySelector('[data-gh-review-rating-input]');
      const starBtns = form.querySelectorAll('[data-star-value]');
      const photoInput = form.querySelector('[data-gh-review-photo-input]');
      const photoCount = form.querySelector('[data-gh-review-photo-count]');
      const photoPreviews = form.querySelector('[data-gh-review-photo-previews]');
      const maxPhotos = parseInt(root.dataset.maxPhotos || '5', 10);
      let selectedPhotos = [];

      starBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const val = btn.dataset.starValue;
          ratingInput.value = val;
          starBtns.forEach((b, idx) => {
            b.classList.toggle('is-active', idx < parseInt(val, 10));
          });
          hideError('rating');
        });
      });

      function hideError(field) {
        const err = form.querySelector('[data-gh-review-error="' + field + '"]');
        if (err) err.hidden = true;
      }

      function showError(field) {
        const err = form.querySelector('[data-gh-review-error="' + field + '"]');
        if (err) err.hidden = false;
      }

      function readPhotosAsDataUrls(files) {
        return Promise.all(
          Array.from(files).map(
            (file) =>
              new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(file);
              })
          )
        );
      }

      if (photoInput) {
        photoInput.addEventListener('change', async () => {
          const files = Array.from(photoInput.files || []);
          const room = maxPhotos - selectedPhotos.length;
          const slice = files.slice(0, room);
          const urls = (await readPhotosAsDataUrls(slice)).filter(Boolean);
          selectedPhotos = selectedPhotos.concat(urls).slice(0, maxPhotos);
          photoInput.value = '';
          renderPhotoPreviews();
        });
      }

      function renderPhotoPreviews() {
        if (!photoPreviews) return;
        photoPreviews.innerHTML = '';
        selectedPhotos.forEach((src, index) => {
          const wrap = document.createElement('div');
          wrap.className = 'gh-review-modal__photo-thumb';
          wrap.innerHTML =
            '<img src="' + src + '" alt=""><button type="button" aria-label="Remove photo">&times;</button>';
          wrap.querySelector('button').addEventListener('click', () => {
            selectedPhotos.splice(index, 1);
            renderPhotoPreviews();
          });
          photoPreviews.appendChild(wrap);
        });
        if (photoCount) photoCount.textContent = String(selectedPhotos.length);
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        let valid = true;

        const rating = ratingInput.value;
        const body = form.querySelector('[data-gh-review-body]').value.trim();
        const name = form.querySelector('[data-gh-review-name]').value.trim();
        const email = form.querySelector('[data-gh-review-email]').value.trim();

        if (!rating) {
          showError('rating');
          valid = false;
        } else hideError('rating');

        if (!body) {
          showError('body');
          valid = false;
        } else hideError('body');

        if (!name) {
          showError('name');
          valid = false;
        } else hideError('name');

        const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        if (!emailOk) {
          showError('email');
          valid = false;
        } else hideError('email');

        if (!valid) return;

        const review = {
          id: Date.now().toString(),
          author: name,
          email: email,
          rating: parseInt(rating, 10),
          body: body,
          title: deriveTitle(body),
          date_label: 'Just now',
          verified: false,
          photos: selectedPhotos.slice(0, maxPhotos),
          initials: getInitials(name),
        };

        if (productId) {
          const stored = loadStored(productId);
          stored.unshift(review);
          saveStored(productId, stored);
        }

        prependReview(review);

        const success = form.querySelector('[data-gh-review-success]');
        const submitBtn = form.querySelector('[data-gh-review-submit]');
        if (success) success.hidden = false;
        if (submitBtn) submitBtn.disabled = true;

        setTimeout(() => {
          form.reset();
          selectedPhotos = [];
          renderPhotoPreviews();
          starBtns.forEach((b) => b.classList.remove('is-active'));
          ratingInput.value = '';
          if (success) success.hidden = true;
          if (submitBtn) submitBtn.disabled = false;
          closeModal();
        }, 1200);
      });

      modal.querySelectorAll('[data-gh-review-modal-close]').forEach((el) => {
        el.addEventListener('click', closeModal);
      });

      document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && modal && !modal.hidden) closeModal();
      });
    }

    if (writeBtn) {
      writeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
      });
    }

    injectStoredReviews();
    refreshItems();
    updateCount();
    initModal();

    if (filterBtn && filterMenu) {
      filterBtn.addEventListener('click', () => {
        const open = filterMenu.hidden === false;
        filterMenu.hidden = open;
        filterBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
      });

      filterMenu.querySelectorAll('[data-filter]').forEach((btn) => {
        btn.addEventListener('click', () => {
          activeFilter = btn.dataset.filter || 'all';
          filterMenu.hidden = true;
          filterBtn.setAttribute('aria-expanded', 'false');
          renderPage(1);
        });
      });

      document.addEventListener('click', (e) => {
        if (!root.contains(e.target)) {
          filterMenu.hidden = true;
          filterBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    renderPage(1);
  }

  function boot() {
    document.querySelectorAll('[data-gh-reviews]').forEach(initReviews);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('shopify:section:load', (event) => {
    const target = event.target;
    const root = target.matches('[data-gh-reviews]') ? target : target.querySelector('[data-gh-reviews]');
    if (root) {
      root.dataset.ghReviewsInit = 'false';
      initReviews(root);
    }
  });
})();
