/* ==========================================================================
   SMART LIBRARY MANAGEMENT SYSTEM - ADMIN BOOK SEARCH SCRIPT
   Connected directly to FastAPI backend and Supabase PostgreSQL database
   Features Department-based visual shelf matrix map (CSE, EE, ENTC, ME, MBA, SCI, REL)
   ========================================================================== */

let allAdminBooks = [];
let categoriesList = [];
let authorsList = [];
let selectedBookId = null;
let activeDeptTabCode = null;

const DEPARTMENTS = {
  'CSE': { code: 'CSE', name: 'Computer / IT Engineering', catName: 'computer/it engineering', icon: 'fa-laptop-code' },
  'EE': { code: 'EE', name: 'Electrical Engineering', catName: 'electrical engineering', icon: 'fa-bolt' },
  'ENTC': { code: 'ENTC', name: 'Electronics & Telecom', catName: 'electronics and telecommunications engineering', icon: 'fa-microchip' },
  'ME': { code: 'ME', name: 'Mechanical Engineering', catName: 'Mechanical engineering', icon: 'fa-gear' },
  'MBA': { code: 'MBA', name: 'Business Administration (MBA)', catName: 'Master of business administration', icon: 'fa-chart-line' },
  'SCI': { code: 'SCI', name: 'Pure Science', catName: 'pure science', icon: 'fa-flask' },
  'REL': { code: 'REL', name: 'Religious Section', catName: 'religious section', icon: 'fa-book-open' }
};

document.addEventListener('DOMContentLoaded', async () => {
  initHeaderSearch();
  initFilterHandlers();
  await fetchAdminBooksFromDatabase();
});

function getApiBaseCandidates() {
  const candidates = [];
  if (typeof window.getApiBase === 'function') {
    try { candidates.push(window.getApiBase()); } catch(e){}
  }
  if (window.API_BASE_URL) candidates.push(window.API_BASE_URL);
  if (window.location.port === '8000') candidates.push('');
  candidates.push('http://127.0.0.1:8000');
  candidates.push('http://localhost:8000');
  candidates.push(window.location.origin);
  return [...new Set(candidates.filter(Boolean))];
}

async function fetchAdminBooksFromDatabase(query = '', category = '', author = '', status = '') {
  const mainContainer = document.getElementById('admin-main-book-container');
  if (mainContainer) {
    mainContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #64748B;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 12px; display: block;"></i> Fetching books from database...</div>';
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
  let fetchedData = null;
  let lastErr = null;

  for (const base of candidates) {
    try {
      const url = `${base.replace(/\/$/, '')}/api/admin/books?${params.toString()}`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        fetchedData = await res.json();
        break;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  if (!fetchedData) {
    console.error('Failed to fetch admin books from database candidates:', lastErr);
    if (mainContainer) {
      mainContainer.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #EF4444;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size: 28px; margin-bottom: 10px; display: block;"></i>
          Unable to connect to library database server at http://127.0.0.1:8000.
          <br><br>
          <button onclick="fetchAdminBooksFromDatabase()" style="padding: 8px 20px; background: #3D539F; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
            <i class="fa-solid fa-rotate-right"></i> Retry Connection
          </button>
        </div>
      `;
    }
    return;
  }

  try {
    allAdminBooks = fetchedData.books || [];
    if (Array.isArray(fetchedData.categories) && fetchedData.categories.length > 0) {
      categoriesList = fetchedData.categories;
      populateAdminCategoryDropdown();
    }
    if (Array.isArray(fetchedData.authors) && fetchedData.authors.length > 0) {
      authorsList = fetchedData.authors;
      populateAdminAuthorDropdown();
    }

    if (!selectedBookId || !allAdminBooks.some(b => String(b.id) === String(selectedBookId))) {
      selectedBookId = allAdminBooks.length > 0 ? allAdminBooks[0].id : null;
    }

    renderAdminSearchResults();
  } catch (err) {
    console.error('Error rendering admin book search results:', err);
  }
}

function populateAdminCategoryDropdown() {
  const select = document.getElementById('admin-category-select');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="">All Departments / Categories</option>' +
    categoriesList.map(cat => `<option value="${escapeHTML(cat)}" ${cat === currentVal ? 'selected' : ''}>${escapeHTML(cat)}</option>`).join('');
}

function populateAdminAuthorDropdown() {
  const select = document.getElementById('admin-author-select');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="">All Authors</option>' +
    authorsList.map(auth => `<option value="${escapeHTML(auth)}" ${auth === currentVal ? 'selected' : ''}>${escapeHTML(auth)}</option>`).join('');
}

function renderAdminSearchResults() {
  const countSpan = document.getElementById('admin-results-count');
  const mainContainer = document.getElementById('admin-main-book-container');
  const otherContainer = document.getElementById('admin-other-books-list');

  if (countSpan) {
    countSpan.innerHTML = `Search Results <span>(${allAdminBooks.length} ${allAdminBooks.length === 1 ? 'book' : 'books'} found)</span>`;
  }

  if (allAdminBooks.length === 0) {
    if (mainContainer) {
      mainContainer.innerHTML = `<div style="text-align: center; padding: 40px; color: #64748B;">No books match your search criteria.</div>`;
    }
    if (otherContainer) {
      otherContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: #94A3B8; font-size: 14px;">No other books found.</div>`;
    }
    renderEmptyShelfLocation();
    return;
  }

  const selectedBook = allAdminBooks.find(b => String(b.id) === String(selectedBookId)) || allAdminBooks[0];
  selectedBookId = selectedBook.id;

  const defaultCover = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160' viewBox='0 0 120 160'><rect width='100%' height='100%' fill='%233D539F'/><text x='60' y='80' fill='%23FFFFFF' font-size='10' font-weight='bold' text-anchor='middle'>BOOK</text></svg>";
  const coverUrl = selectedBook.cover && !selectedBook.cover.includes('unsplash.com') ? selectedBook.cover : defaultCover;
  const availCount = selectedBook.availableCopies !== undefined ? selectedBook.availableCopies : 1;
  const totalCount = selectedBook.totalCopies !== undefined ? selectedBook.totalCopies : 1;
  const isAvailable = availCount > 0;

  const loc = parseShelfLocation(selectedBook.shelf || selectedBook.shelfLocation, selectedBook.category);
  if (!activeDeptTabCode) {
    activeDeptTabCode = loc.deptCode;
  }

  if (mainContainer) {
    mainContainer.innerHTML = `
      <img src="${coverUrl}" alt="${escapeHTML(selectedBook.title)}" class="main-book-cover" onerror="this.src='${defaultCover}'">
      
      <div class="main-book-info">
        <div class="main-book-header">
          <div>
            <h2 class="main-book-title">${escapeHTML(selectedBook.title)}</h2>
            <p class="main-book-author">${escapeHTML(selectedBook.author)}</p>
          </div>
          <span class="badge-available" style="background: ${isAvailable ? '#DCFCE7' : '#FEE2E2'}; color: ${isAvailable ? '#15803D' : '#B91C1C'}; border-radius: 999px; padding: 4px 12px; font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
            <i class="fa-solid ${isAvailable ? 'fa-check' : 'fa-xmark'}"></i> ${isAvailable ? 'Available' : 'Out of Stock'}
          </span>
        </div>

        <div class="main-book-tags">
          <span class="tag-pill" style="background:#EEF2FF; color:#3D539F;"><i class="fa-solid ${loc.icon}"></i> ${escapeHTML(loc.deptName)}</span>
          <span class="tag-pill" style="background:#F1F5F9; color:#475569;">Code: ${loc.deptCode}</span>
        </div>

        <div class="details-grid">
          <div>
            <div class="grid-item-label">ISBN</div>
            <div class="grid-item-val">${escapeHTML(selectedBook.isbn || '-')}</div>
          </div>
          <div>
            <div class="grid-item-label">Department</div>
            <div class="grid-item-val" style="color:#3D539F;">${loc.deptCode}</div>
          </div>
          <div>
            <div class="grid-item-label">Total Copies</div>
            <div class="grid-item-val">${totalCount}</div>
          </div>
          <div>
            <div class="grid-item-label">Available</div>
            <div class="grid-item-val" style="color: ${isAvailable ? '#16A34A' : '#EF4444'}; font-weight: 700;">${availCount}</div>
          </div>
        </div>

        <button class="btn-outline-details" onclick="viewBookDetailsModal('${selectedBook.id}')">
          <i class="fa-regular fa-eye"></i> View Full Details
        </button>
      </div>
    `;
  }

  // Render Other Books Found
  const otherBooks = allAdminBooks.filter(b => String(b.id) !== String(selectedBook.id));
  if (otherContainer) {
    if (otherBooks.length === 0) {
      otherContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: #94A3B8; font-size: 14px;">No other matching books.</div>`;
    } else {
      otherContainer.innerHTML = otherBooks.map(book => {
        const otherCover = book.cover && !book.cover.includes('unsplash.com') ? book.cover : defaultCover;
        const otherAvail = book.availableCopies !== undefined ? book.availableCopies : 1;
        const otherTotal = book.totalCopies !== undefined ? book.totalCopies : 1;
        const otherIsAvail = otherAvail > 0;
        const otherLoc = parseShelfLocation(book.shelf || book.shelfLocation, book.category);

        return `
          <div class="other-book-item" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #F1F5F9; gap: 12px;">
            <div class="other-book-left" style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
              <img src="${otherCover}" alt="${escapeHTML(book.title)}" class="other-book-thumb" style="width: 44px; height: 58px; object-fit: cover; border-radius: 6px; flex-shrink: 0;" onerror="this.src='${defaultCover}'">
              <div style="min-width: 0;">
                <div class="other-book-name" style="font-weight: 700; color: #0F172A; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(book.title)}</div>
                <div class="other-book-author" style="font-size: 12px; color: #64748B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(book.author)} • <strong style="color:#3D539F;">${otherLoc.deptCode}</strong> (Shelf ${otherLoc.shelfNum})</div>
              </div>
            </div>
            <div class="other-book-right" style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
              <span class="avail-text ${otherIsAvail ? '' : 'out'}" style="font-size: 12px; font-weight: 600; color: ${otherIsAvail ? '#16A34A' : '#EF4444'};">Available: ${otherAvail}/${otherTotal}</span>
              <button class="btn-outline-details" style="padding: 6px 12px; font-size: 12px; cursor: pointer; border: 1px solid #CBD5E1; background: #fff; border-radius: 6px; font-weight: 600;" onclick="selectMainBook('${book.id}')">
                <i class="fa-solid fa-location-dot"></i> Locate
              </button>
              <button class="btn-outline-details" style="padding: 6px 12px; font-size: 12px; cursor: pointer; border: 1px solid #CBD5E1; background: #fff; border-radius: 6px; font-weight: 600;" onclick="viewBookDetailsModal('${book.id}')">
                <i class="fa-regular fa-eye"></i> Details
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Render Right Department Shelf Location & Map
  renderDepartmentShelfLocationAndMap(selectedBook, activeDeptTabCode);
}

function parseShelfLocation(rawShelf, category = '') {
  let deptCode = 'CSE';
  let shelfNum = '1';
  let rowNum = '1';

  const str = String(rawShelf || '').trim();
  const catLower = String(category || '').toLowerCase();

  // Pattern 1: CSE 2 4 or ME 1 3 or ENTC 3 2 or REL 1 4 or EE 2 1
  const mCode = str.match(/^([A-Z]+)\s+(\d+)\s+(\d+)$/i);
  if (mCode) {
    deptCode = mCode[1].toUpperCase();
    shelfNum = String(parseInt(mCode[2], 10) || 1);
    rowNum = String(parseInt(mCode[3], 10) || 1);
  } else {
    // Pattern 2: Section A - Shelf 2 - Row 4
    const mSec = str.match(/(?:Section|Sec|Dept)?\s*([A-Z0-9]+)\s*[-:]?\s*(?:Shelf)?\s*(\d+)\s*[-:]?\s*(?:Row)?\s*(\d+)/i);
    if (mSec) {
      const codeCand = mSec[1].toUpperCase();
      if (DEPARTMENTS[codeCand]) {
        deptCode = codeCand;
      }
      shelfNum = String(parseInt(mSec[2], 10) || 1);
      rowNum = String(parseInt(mSec[3], 10) || 1);
    }
  }

  // Map from category if deptCode not registered in DEPARTMENTS
  if (!DEPARTMENTS[deptCode]) {
    if (catLower.includes('computer') || catLower.includes('it') || catLower.includes('prog')) deptCode = 'CSE';
    else if (catLower.includes('electrical') && !catLower.includes('telecom') && !catLower.includes('electronics')) deptCode = 'EE';
    else if (catLower.includes('telecom') || catLower.includes('electronics') || catLower.includes('entc')) deptCode = 'ENTC';
    else if (catLower.includes('mech')) deptCode = 'ME';
    else if (catLower.includes('business') || catLower.includes('mba') || catLower.includes('management')) deptCode = 'MBA';
    else if (catLower.includes('science') || catLower.includes('pure')) deptCode = 'SCI';
    else if (catLower.includes('relig')) deptCode = 'REL';
    else deptCode = 'CSE';
  }

  const deptObj = DEPARTMENTS[deptCode] || DEPARTMENTS['CSE'];
  const locationCode = `${deptCode}-${shelfNum}-${rowNum}`;
  const displayLocation = `${deptObj.name} (${deptCode}) - Shelf ${shelfNum} - Row ${rowNum}`;

  return {
    deptCode,
    deptName: deptObj.name,
    icon: deptObj.icon,
    shelfNum,
    rowNum,
    locationCode,
    displayLocation
  };
}

function renderDepartmentShelfLocationAndMap(book, currentActiveDeptCode) {
  const infoContainer = document.getElementById('admin-shelf-info-container');
  const mapContainer = document.getElementById('admin-shelf-map-container');
  const tipContainer = document.getElementById('admin-shelf-tip-container');

  if (!book) {
    renderEmptyShelfLocation();
    return;
  }

  const rawShelf = book.shelf || book.shelfLocation || '-';
  const targetLoc = parseShelfLocation(rawShelf, book.category);

  activeDeptTabCode = currentActiveDeptCode || targetLoc.deptCode;
  const activeDeptObj = DEPARTMENTS[activeDeptTabCode] || DEPARTMENTS['CSE'];

  const callNum = book.callNumber || `${targetLoc.deptCode} ${book.classNumber || '005.1'} ${(book.author || 'LIB').substring(0,3).toUpperCase()}`;
  const barcodeVal = book.accessionNumber || book.barcode || book.isbn || '10001';

  // 1. Info Card
  if (infoContainer) {
    infoContainer.innerHTML = `
      <div class="widget-card-title">
        <i class="fa-solid fa-bookmark"></i>
        <span>Book Location on Shelf</span>
      </div>

      <div class="target-book-title">${escapeHTML(book.title)}</div>

      <div class="location-meta-list">
        <div class="meta-row">
          <span class="meta-key">Department</span>
          <span class="meta-val" style="color: #3D539F;"><i class="fa-solid ${targetLoc.icon}"></i> ${escapeHTML(targetLoc.deptName)} (${targetLoc.deptCode})</span>
        </div>
        <div class="meta-row">
          <span class="meta-key">Call Number</span>
          <span class="meta-val">${escapeHTML(callNum)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-key">Shelf Location</span>
          <span class="meta-val">${escapeHTML(targetLoc.displayLocation)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-key">Barcode / Accession</span>
          <span class="meta-val">${escapeHTML(barcodeVal)}</span>
        </div>
      </div>
    `;
  }

  // 2. Department Shelf Matrix Map Card
  if (mapContainer) {
    const isTargetDeptActive = (activeDeptTabCode === targetLoc.deptCode);
    const targetShelfInt = parseInt(targetLoc.shelfNum, 10) || 1;
    const targetRowInt = parseInt(targetLoc.rowNum, 10) || 1;

    mapContainer.innerHTML = `
      <div class="widget-card-title" style="justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-layer-group"></i>
          <span>Department Shelf Matrix</span>
        </div>
        <span style="font-size: 11px; padding: 2px 8px; background: #EEF2FF; color: #3D539F; border-radius: 4px; font-weight: 700;">
          Showing: ${activeDeptObj.code}
        </span>
      </div>

      <!-- Department Selector Tabs -->
      <div class="dept-tabs-container">
        ${Object.keys(DEPARTMENTS).map(code => {
          const dept = DEPARTMENTS[code];
          const isActive = (code === activeDeptTabCode);
          const isBookDept = (code === targetLoc.deptCode);
          return `
            <button class="dept-tab-btn ${isActive ? 'active' : ''} ${isBookDept ? 'target-dept' : ''}" onclick="switchDepartmentMapTab('${code}')" title="${escapeHTML(dept.name)}">
              <i class="fa-solid ${dept.icon}"></i> ${code}
            </button>
          `;
        }).join('')}
      </div>

      <!-- Department Header -->
      <div style="font-size: 13px; font-weight: 800; color: #0F172A; display: flex; align-items: center; justify-content: space-between; background: #F8FAFC; padding: 8px 12px; border-radius: 6px;">
        <span><i class="fa-solid ${activeDeptObj.icon}" style="color: #3D539F; margin-right: 6px;"></i> ${escapeHTML(activeDeptObj.name)}</span>
        <span style="font-size: 11px; color: #64748B;">Department Code: ${activeDeptObj.code}</span>
      </div>

      <!-- Matrix Column Headers (Shelf 1, Shelf 2, Shelf 3) -->
      <div class="map-sections-header" style="padding-left: 50px; grid-template-columns: repeat(3, 1fr);">
        <span>Shelf 1</span>
        <span>Shelf 2</span>
        <span>Shelf 3</span>
      </div>

      <!-- Matrix Rows Wrapper (Row 1, Row 2, Row 3, Row 4) -->
      <div class="map-rows-wrapper">
        ${[1, 2, 3, 4].map(r => `
          <div class="map-row">
            <span class="row-label" style="width: 45px; font-size: 11px; font-weight: 700; color: #64748B;">Row ${r}</span>
            <div class="row-cells-grid" style="grid-template-columns: repeat(3, 1fr);">
              ${[1, 2, 3].map(s => {
                const isTargetCell = isTargetDeptActive && (s === targetShelfInt && r === targetRowInt);
                const cellCode = `${activeDeptObj.code}-${s}-${r}`;

                return `
                  <div class="shelf-cell ${isTargetCell ? 'target-location' : ''}" title="${cellCode}">
                    ${isTargetCell ? `<div class="location-tooltip-badge">${cellCode}</div>` : ''}
                    <div class="spine" style="${isTargetCell ? 'background:#3D539F;' : ''}"></div>
                    <div class="spine" style="${isTargetCell ? 'background:#3D539F;' : ''}"></div>
                    <div class="spine" style="${isTargetCell ? 'background:#3D539F;' : ''}"></div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>

      <div class="shelf-legend-grid">
        <div class="legend-item">
          <div class="legend-box blue"></div>
          <span>Target Book Location (${targetLoc.locationCode})</span>
        </div>
        <div class="legend-item">
          <div class="legend-box grey"></div>
          <span>Department Shelves</span>
        </div>
        <div class="legend-item">
          <div class="legend-box green"></div>
          <span>Available</span>
        </div>
        <div class="legend-item">
          <div class="legend-box red"></div>
          <span>Out of Stock</span>
        </div>
      </div>
    `;
  }

  // 3. Locator Tip Callout
  if (tipContainer) {
    tipContainer.innerHTML = `
      <div class="tip-icon-box">
        <i class="fa-solid fa-location-dot"></i>
      </div>
      <div>
        <div class="tip-text-title">Go to ${escapeHTML(targetLoc.deptName)} (${targetLoc.deptCode})</div>
        <div class="tip-text-sub">The book "${escapeHTML(book.title)}" is located at <strong>Shelf ${targetLoc.shelfNum}, Row ${targetLoc.rowNum}</strong> (${targetLoc.locationCode}).</div>
      </div>
    `;
  }
}

function switchDepartmentMapTab(deptCode) {
  activeDeptTabCode = deptCode;
  const selectedBook = allAdminBooks.find(b => String(b.id) === String(selectedBookId)) || allAdminBooks[0];
  renderDepartmentShelfLocationAndMap(selectedBook, activeDeptTabCode);
}

function renderEmptyShelfLocation() {
  const infoContainer = document.getElementById('admin-shelf-info-container');
  const mapContainer = document.getElementById('admin-shelf-map-container');
  const tipContainer = document.getElementById('admin-shelf-tip-container');

  if (infoContainer) {
    infoContainer.innerHTML = `<div style="padding: 20px; color: #94A3B8; text-align: center;">No book selected.</div>`;
  }
  if (mapContainer) {
    mapContainer.innerHTML = `<div style="padding: 20px; color: #94A3B8; text-align: center;">Department shelf map unavailable.</div>`;
  }
  if (tipContainer) {
    tipContainer.innerHTML = `<div style="padding: 16px; color: #94A3B8; text-align: center;">Select a book to view its department shelf location.</div>`;
  }
}

function selectMainBook(bookId) {
  selectedBookId = bookId;
  const selectedBook = allAdminBooks.find(b => String(b.id) === String(bookId));
  if (selectedBook) {
    const loc = parseShelfLocation(selectedBook.shelf || selectedBook.shelfLocation, selectedBook.category);
    activeDeptTabCode = loc.deptCode;
  }
  renderAdminSearchResults();
}

function viewBookDetailsModal(bookId) {
  const book = allAdminBooks.find(b => String(b.id) === String(bookId));
  if (!book) return;

  const modal = document.getElementById('admin-book-modal');
  const modalContent = document.getElementById('admin-modal-content');
  if (!modal || !modalContent) return;

  const defaultCover = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160' viewBox='0 0 120 160'><rect width='100%' height='100%' fill='%233D539F'/><text x='60' y='80' fill='%23FFFFFF' font-size='10' font-weight='bold' text-anchor='middle'>BOOK</text></svg>";
  const coverUrl = book.cover && !book.cover.includes('unsplash.com') ? book.cover : defaultCover;
  const availCount = book.availableCopies !== undefined ? book.availableCopies : 1;
  const totalCount = book.totalCopies !== undefined ? book.totalCopies : 1;
  const loc = parseShelfLocation(book.shelf || book.shelfLocation, book.category);

  modalContent.innerHTML = `
    <button onclick="closeAdminBookModal()" style="position: absolute; top: 16px; right: 16px; background: none; border: none; font-size: 20px; cursor: pointer; color: #64748B;"><i class="fa-solid fa-xmark"></i></button>
    <div style="display: flex; gap: 20px; flex-wrap: wrap;">
      <img src="${coverUrl}" style="width: 120px; height: 160px; object-fit: cover; border-radius: 12px; flex-shrink: 0;" alt="${escapeHTML(book.title)}" onerror="this.src='${defaultCover}'">
      <div style="flex: 1; min-width: 200px;">
        <h2 style="font-size: 20px; font-weight: 800; color: #0F172A; margin-bottom: 4px;">${escapeHTML(book.title)}</h2>
        <p style="font-size: 14px; color: #64748B; margin-bottom: 8px;">by ${escapeHTML(book.author)}</p>
        <span style="display: inline-block; padding: 4px 12px; background: #EEF2FF; color: #3D539F; border-radius: 999px; font-size: 12px; font-weight: 700; margin-bottom: 12px;">${escapeHTML(loc.deptName)}</span>
        <p style="font-size: 14px; color: #475569; line-height: 1.5; margin-bottom: 16px;">${escapeHTML(book.description || 'Library catalog reference record.')}</p>
        <div style="font-size: 13px; color: #64748B; display: flex; flex-direction: column; gap: 6px; background: #F8FAFC; padding: 12px; border-radius: 8px;">
          <div><strong>Department Code:</strong> ${loc.deptCode}</div>
          <div><strong>ISBN:</strong> ${escapeHTML(book.isbn || '-')}</div>
          <div><strong>Accession Number:</strong> ${escapeHTML(book.accessionNumber || '-')}</div>
          <div><strong>Shelf Location:</strong> ${escapeHTML(loc.displayLocation)}</div>
          <div><strong>Status:</strong> <span style="color: ${availCount > 0 ? '#16A34A' : '#EF4444'}; font-weight: 700;">${availCount}/${totalCount} Available</span></div>
        </div>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
}

function closeAdminBookModal() {
  const modal = document.getElementById('admin-book-modal');
  if (modal) modal.style.display = 'none';
}

function initFilterHandlers() {
  const searchInput = document.getElementById('admin-search-input');
  const categorySelect = document.getElementById('admin-category-select');
  const authorSelect = document.getElementById('admin-author-select');
  const statusSelect = document.getElementById('admin-status-select');
  const clearBtn = document.getElementById('clear-admin-search');
  const searchBtn = document.getElementById('admin-search-btn');

  let debounceTimer = null;
  function triggerSearch() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const q = searchInput ? searchInput.value.trim() : '';
      const cat = categorySelect ? categorySelect.value : '';
      const auth = authorSelect ? authorSelect.value : '';
      const stat = statusSelect ? statusSelect.value : '';
      fetchAdminBooksFromDatabase(q, cat, auth, stat);
    }, 250);
  }

  if (searchInput) searchInput.addEventListener('input', triggerSearch);
  if (categorySelect) categorySelect.addEventListener('change', triggerSearch);
  if (authorSelect) authorSelect.addEventListener('change', triggerSearch);
  if (statusSelect) statusSelect.addEventListener('change', triggerSearch);
  if (searchBtn) searchBtn.addEventListener('click', triggerSearch);

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (categorySelect) categorySelect.value = '';
      if (authorSelect) authorSelect.value = '';
      if (statusSelect) statusSelect.value = '';
      fetchAdminBooksFromDatabase();
    });
  }
}

function initHeaderSearch() {
  const topInput = document.querySelector('.top-header .header-search input');
  if (topInput) {
    topInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = topInput.value.trim();
        const mainInput = document.getElementById('admin-search-input');
        if (mainInput) mainInput.value = val;
        fetchAdminBooksFromDatabase(val);
      }
    });
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
  });
}

window.selectMainBook = selectMainBook;
window.viewBookDetailsModal = viewBookDetailsModal;
window.closeAdminBookModal = closeAdminBookModal;
window.switchDepartmentMapTab = switchDepartmentMapTab;
window.fetchAdminBooksFromDatabase = fetchAdminBooksFromDatabase;
