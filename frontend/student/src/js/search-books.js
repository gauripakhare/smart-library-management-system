/**
 * SMART LIBRARY MANAGEMENT SYSTEM - STUDENT BOOK SEARCH SCRIPT
 * Connects directly to FastAPI backend and Supabase PostgreSQL Database.
 * Displays 20 books per page with dynamic pagination.
 */

let allBooks = [];
let currentFilteredBooks = [];
let categoriesList = [];
let authorsList = [];

let currentPage = 1;
const BOOKS_PER_PAGE = 20;

document.addEventListener('DOMContentLoaded', async () => {
  initStudentSearchHeaderInput();
  initFilterHandlers();
  initSortHandler();
  await fetchBooksFromDatabase();
});

function getApiBaseCandidates() {
  const candidates = [];
  if (typeof window.getApiBase === 'function') {
    try { candidates.push(window.getApiBase()); } catch(e){}
  }
  if (window.API_BASE_URL) candidates.push(window.API_BASE_URL);
  
  if (window.location.port === '8000') {
    candidates.push('');
  }
  candidates.push('http://127.0.0.1:8000');
  candidates.push('http://localhost:8000');
  candidates.push(window.location.origin);
  
  return [...new Set(candidates.filter(Boolean))];
}

async function fetchBooksFromDatabase(query = '', category = '', author = '', status = '') {
  const grid = document.getElementById('books-grid');
  if (grid) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #64748B;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 12px; display: block;"></i> Loading books from library database...</div>';
  }

  const params = new URLSearchParams();
  if (query) params.append('q', query);
  if (category) params.append('category', category);
  if (author) params.append('author', author);
  if (status) params.append('status', status);

  const rawToken = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
  const token = (rawToken && rawToken !== 'undefined' && rawToken !== 'null' && rawToken !== '[object Object]') ? rawToken : null;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const candidates = getApiBaseCandidates();
  let data = null;
  let lastErr = null;

  for (const base of candidates) {
    try {
      const url = `${base.replace(/\/$/, '')}/api/admin/books?${params.toString()}`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        data = await res.json();
        break;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  if (!data) {
    console.error('Failed to fetch books from database:', lastErr);
    if (grid) {
      grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #EF4444;">Unable to connect to database. <button onclick="fetchBooksFromDatabase()" style="margin-left: 8px; padding: 6px 16px; background: #3D539F; color: #fff; border: none; border-radius: 6px; cursor: pointer;">Retry</button></div>`;
    }
    return;
  }

  try {
    allBooks = data.books || [];
    currentFilteredBooks = [...allBooks];

    if (Array.isArray(data.categories) && data.categories.length > 0) {
      categoriesList = data.categories;
      populateCategoryDropdown();
    }
    if (Array.isArray(data.authors) && data.authors.length > 0) {
      authorsList = data.authors;
      populateAuthorDropdown();
    }

    currentPage = 1;
    applySortAndRenderPage();
  } catch (err) {
    console.error('Error rendering student books grid:', err);
  }
}

function populateCategoryDropdown() {
  const select = document.getElementById('category-select');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="">All Categories</option>' +
    categoriesList.map(cat => `<option value="${escapeHTML(cat)}" ${cat === currentVal ? 'selected' : ''}>${escapeHTML(cat)}</option>`).join('');
}

function populateAuthorDropdown() {
  const select = document.getElementById('author-select');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="">All Authors</option>' +
    authorsList.map(auth => `<option value="${escapeHTML(auth)}" ${auth === currentVal ? 'selected' : ''}>${escapeHTML(auth)}</option>`).join('');
}

function applySortAndRenderPage() {
  const sortSelect = document.getElementById('sort-select');
  const sortVal = sortSelect ? sortSelect.value : 'relevance';

  if (sortVal === 'title') {
    currentFilteredBooks.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  } else if (sortVal === 'availability') {
    currentFilteredBooks.sort((a, b) => (b.availableCopies || 0) - (a.availableCopies || 0));
  }

  const totalCount = currentFilteredBooks.length;
  const totalPages = Math.ceil(totalCount / BOOKS_PER_PAGE) || 1;

  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIdx = (currentPage - 1) * BOOKS_PER_PAGE;
  const pageBooks = currentFilteredBooks.slice(startIdx, startIdx + BOOKS_PER_PAGE);

  renderBooksGrid(pageBooks, totalCount, totalPages);
  renderPagination(totalPages);
}

function renderBooksGrid(books, totalCount, totalPages) {
  const grid = document.getElementById('books-grid');
  const countSpan = document.getElementById('results-count');
  if (!grid) return;

  if (countSpan) {
    countSpan.innerHTML = `Search Results <span>(${totalCount} ${totalCount === 1 ? 'book' : 'books'} found • Page ${currentPage} of ${totalPages})</span>`;
  }

  if (totalCount === 0 || books.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #64748B;">No books match your search criteria.</div>`;
    return;
  }

  const defaultCover = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160' viewBox='0 0 120 160'><rect width='100%' height='100%' fill='%233D539F'/><text x='60' y='80' fill='%23FFFFFF' font-size='10' font-weight='bold' text-anchor='middle'>BOOK</text></svg>";

  grid.innerHTML = books.map(book => {
    const coverUrl = book.cover && !book.cover.includes('unsplash.com') ? book.cover : defaultCover;
    const availCount = book.availableCopies !== undefined ? book.availableCopies : 1;
    const totalCopies = book.totalCopies !== undefined ? book.totalCopies : 1;
    const isOutOfStock = availCount === 0;

    return `
      <div class="book-card">
        <div class="book-top-flex">
          <img src="${coverUrl}" alt="${escapeHTML(book.title)}" class="book-cover" onerror="this.src='${defaultCover}'">
          <div class="book-meta">
            <h3 class="book-title">${escapeHTML(book.title)}</h3>
            <p class="book-author">${escapeHTML(book.author)}</p>
            <span class="book-category-tag">${escapeHTML(book.category || 'General')}</span>
            <div class="book-availability ${isOutOfStock ? 'out-of-stock' : ''}">
              <i class="fa-solid fa-book"></i>
              <span>Available: ${availCount}/${totalCopies}</span>
            </div>
          </div>
        </div>
        <p class="book-description">${escapeHTML(book.description || `Catalog reference book by ${book.author}.`)}</p>
        <div class="book-actions-row">
          <button class="btn-view-details" style="width: 100%; justify-content: center;" onclick="openBookModal('${book.id}')">
            <i class="fa-regular fa-eye"></i> View Details
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderPagination(totalPages) {
  const container = document.getElementById('pagination-container');
  if (!container) return;

  if (totalPages <= 1) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';

  let html = '';

  // Previous Button
  const prevDisabled = (currentPage === 1);
  html += `
    <button class="page-btn" ${prevDisabled ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : `onclick="changePage(${currentPage - 1})"`}>
      <i class="fa-solid fa-chevron-left"></i>
    </button>
  `;

  // Page Numbers
  for (let p = 1; p <= totalPages; p++) {
    const isActive = (p === currentPage);
    html += `
      <button class="page-btn ${isActive ? 'active' : ''}" onclick="changePage(${p})">
        ${p}
      </button>
    `;
  }

  // Next Button
  const nextDisabled = (currentPage === totalPages);
  html += `
    <button class="page-btn" ${nextDisabled ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : `onclick="changePage(${currentPage + 1})"`}>
      <i class="fa-solid fa-chevron-right"></i>
    </button>
  `;

  container.innerHTML = html;
}

function changePage(newPage) {
  currentPage = newPage;
  applySortAndRenderPage();
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function initFilterHandlers() {
  const searchInput = document.getElementById('search-input');
  const categorySelect = document.getElementById('category-select');
  const authorSelect = document.getElementById('author-select');
  const clearBtn = document.getElementById('clear-search');

  let debounceTimer = null;
  function triggerSearch() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const q = searchInput ? searchInput.value.trim() : '';
      const cat = categorySelect ? categorySelect.value : '';
      const auth = authorSelect ? authorSelect.value : '';
      fetchBooksFromDatabase(q, cat, auth);
    }, 250);
  }

  if (searchInput) searchInput.addEventListener('input', triggerSearch);
  if (categorySelect) categorySelect.addEventListener('change', triggerSearch);
  if (authorSelect) authorSelect.addEventListener('change', triggerSearch);

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (categorySelect) categorySelect.value = '';
      if (authorSelect) authorSelect.value = '';
      fetchBooksFromDatabase();
    });
  }
}

function initSortHandler() {
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      currentPage = 1;
      applySortAndRenderPage();
    });
  }
}

function initStudentSearchHeaderInput() {
  const topInput = document.querySelector('.header-search input');
  if (topInput) {
    topInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = topInput.value.trim();
        const mainInput = document.getElementById('search-input');
        if (mainInput) mainInput.value = val;
        fetchBooksFromDatabase(val);
      }
    });
  }
}

function openBookModal(id) {
  const book = allBooks.find(b => String(b.id) === String(id));
  if (!book) return;

  const modal = document.getElementById('book-modal');
  const modalContent = document.getElementById('modal-content');
  if (!modal || !modalContent) return;

  const defaultCover = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160' viewBox='0 0 120 160'><rect width='100%' height='100%' fill='%233D539F'/><text x='60' y='80' fill='%23FFFFFF' font-size='10' font-weight='bold' text-anchor='middle'>BOOK</text></svg>";
  const coverUrl = book.cover && !book.cover.includes('unsplash.com') ? book.cover : defaultCover;
  const availCount = book.availableCopies !== undefined ? book.availableCopies : 1;
  const totalCount = book.totalCopies !== undefined ? book.totalCopies : 1;

  modalContent.innerHTML = `
    <button class="modal-close-btn" onclick="closeBookModal()"><i class="fa-solid fa-xmark"></i></button>
    <div style="display: flex; gap: 20px; flex-wrap: wrap;">
      <img src="${coverUrl}" style="width: 120px; height: 160px; object-fit: cover; border-radius: 12px;" alt="${escapeHTML(book.title)}" onerror="this.src='${defaultCover}'">
      <div style="flex: 1; min-width: 200px;">
        <h2 style="font-size: 20px; font-weight: 800; color: #0F172A; margin-bottom: 4px;">${escapeHTML(book.title)}</h2>
        <p style="font-size: 14px; color: #64748B; margin-bottom: 8px;">by ${escapeHTML(book.author)}</p>
        <span style="display: inline-block; padding: 4px 12px; background: #EEF2FF; color: #3D539F; border-radius: 999px; font-size: 12px; font-weight: 700; margin-bottom: 12px;">${escapeHTML(book.category || 'General')}</span>
        <p style="font-size: 14px; color: #475569; line-height: 1.5; margin-bottom: 16px;">${escapeHTML(book.description || 'Library catalog reference book.')}</p>
        <div style="font-size: 13px; color: #64748B; display: flex; flex-direction: column; gap: 6px;">
          <div><strong>ISBN:</strong> ${escapeHTML(book.isbn || '-')}</div>
          <div><strong>Accession Number:</strong> ${escapeHTML(book.accessionNumber || '-')}</div>
          <div><strong>Shelf Location:</strong> ${escapeHTML(book.shelf || book.shelfLocation || 'Section A')}</div>
          <div><strong>Status:</strong> <span style="color: ${availCount > 0 ? '#16A34A' : '#EF4444'}; font-weight: 700;">${availCount}/${totalCount} Available</span></div>
        </div>
      </div>
    </div>
  `;

  modal.classList.add('active');
}

function closeBookModal() {
  const modal = document.getElementById('book-modal');
  if (modal) modal.classList.remove('active');
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
  });
}

window.fetchBooksFromDatabase = fetchBooksFromDatabase;
window.openBookModal = openBookModal;
window.closeBookModal = closeBookModal;
window.changePage = changePage;
