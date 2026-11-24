/* ==========================================================================
   SMART LIBRARY MANAGEMENT SYSTEM - ADMIN BOOK MANAGEMENT INTERACTIVE SCRIPT
   ========================================================================== */

// Books are loaded only from the backend database.
let booksData = [];
let tableCurrentPage = 1;
const TABLE_BOOKS_PER_PAGE = 20;
/*
  {
    id: 1,
    title: "Clean Code",
    subtitle: "A Handbook of Agile Software Craftsmanship",
    author: "Robert C. Martin",
    coAuthor: "",
    isbn: "978-0132350884",
    publisher: "Prentice Hall",
    category: "Computer Science",
    language: "English",
    pubYear: "2008",
    edition: "1st Edition",
    totalCopies: 10,
    availableCopies: 7,
    status: "Available",
    shelf: "A-01-04",
    rack: "02",
    pages: 464,
    dimensions: "17.8 x 2.8 x 23.4 cm",
    weight: "0.75 kg",
    cover: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160' viewBox='0 0 120 160'><rect width='100%' height='100%' fill='%230B1736'/><rect x='10' y='10' width='100' height='140' fill='none' stroke='%233B82F6' stroke-width='2'/><text x='60' y='65' fill='%23FFFFFF' font-size='13' font-weight='bold' text-anchor='middle' font-family='sans-serif'>CLEAN</text><text x='60' y='85' fill='%2360A5FA' font-size='13' font-weight='bold' text-anchor='middle' font-family='sans-serif'>CODE</text><text x='60' y='120' fill='%2394A3B8' font-size='8' text-anchor='middle' font-family='sans-serif'>Robert C. Martin</text></svg>",
    description: "Even bad code can function. But if code isn't clean, it can bring a development organization to its knees.",
    addedOn: "10 Jan 2024",
    lastUpdated: "15 Apr 2025",
    addedBy: "Admin User"
  },
  {
    id: 2,
    title: "Atomic Habits",
    subtitle: "Tiny Changes, Remarkable Results",
    author: "James Clear",
    coAuthor: "",
    isbn: "978-0735211292",
    publisher: "Avery",
    category: "Self Help",
    language: "English",
    pubYear: "2018",
    edition: "1st Edition",
    totalCopies: 8,
    availableCopies: 5,
    status: "Available",
    shelf: "A-05-02",
    rack: "05",
    pages: 320,
    dimensions: "13.5 x 20.5 cm",
    weight: "0.35 kg",
    cover: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160' viewBox='0 0 120 160'><rect width='100%' height='100%' fill='%23FFFDF7'/><rect x='8' y='8' width='104' height='144' fill='none' stroke='%23E2E8F0' stroke-width='1'/><circle cx='60' cy='80' r='35' fill='%23FEF3C7' opacity='0.6'/><text x='60' y='65' fill='%23B45309' font-size='12' font-weight='bold' text-anchor='middle' font-family='sans-serif'>ATOMIC</text><text x='60' y='85' fill='%23D97706' font-size='12' font-weight='bold' text-anchor='middle' font-family='sans-serif'>HABITS</text><text x='60' y='125' fill='%2378350F' font-size='8' text-anchor='middle' font-family='sans-serif'>James Clear</text></svg>",
    description: "A practical guide to building good habits, breaking bad ones, and mastering the tiny behaviors that lead to remarkable results.",
    addedOn: "12 Jan 2024",
    lastUpdated: "02 May 2025",
    addedBy: "Admin User"
  },
  {
    id: 3,
    title: "The Alchemist",
    subtitle: "A Fable About Following Your Dream",
    author: "Paulo Coelho",
    coAuthor: "",
    isbn: "978-0062315007",
    publisher: "HarperOne",
    category: "Fiction",
    language: "English",
    pubYear: "1988",
    edition: "25th Anniversary Edition",
    totalCopies: 6,
    availableCopies: 0,
    status: "Issued",
    shelf: "B-03-01",
    rack: "01",
    pages: 208,
    dimensions: "13.3 x 1.3 x 20.3 cm",
    weight: "0.22 kg",
    cover: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160' viewBox='0 0 120 160'><rect width='100%' height='100%' fill='%23991B1B'/><circle cx='60' cy='70' r='25' fill='%23F59E0B'/><text x='60' y='68' fill='%23FFFFFF' font-size='10' font-weight='bold' text-anchor='middle' font-family='sans-serif'>THE</text><text x='60' y='80' fill='%23FFFFFF' font-size='10' font-weight='bold' text-anchor='middle' font-family='sans-serif'>ALCHEMIST</text><text x='60' y='130' fill='%23FDE68A' font-size='8' text-anchor='middle' font-family='sans-serif'>Paulo Coelho</text></svg>",
    description: "Combining magic, mysticism, wisdom and wonder into an inspiring tale of self-discovery.",
    addedOn: "15 Jan 2024",
    lastUpdated: "10 Mar 2025",
    addedBy: "Admin User"
  },
  {
    id: 4,
    title: "Database System Concepts",
    subtitle: "Comprehensive introduction to database management",
    author: "Abraham Silberschatz",
    coAuthor: "Henry F. Korth",
    isbn: "978-0078022159",
    publisher: "McGraw-Hill Education",
    category: "Computer Science",
    language: "English",
    pubYear: "2019",
    edition: "7th Edition",
    totalCopies: 5,
    availableCopies: 1,
    status: "Low Stock",
    shelf: "A-02-05",
    rack: "03",
    pages: 1376,
    dimensions: "20.3 x 4.6 x 25.4 cm",
    weight: "1.85 kg",
    cover: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160' viewBox='0 0 120 160'><rect width='100%' height='100%' fill='%230F172A'/><rect x='15' y='40' width='90' height='60' fill='none' stroke='%2338BDF8' stroke-width='2'/><text x='60' y='65' fill='%2338BDF8' font-size='10' font-weight='bold' text-anchor='middle' font-family='sans-serif'>DATABASE</text><text x='60' y='80' fill='%23FFFFFF' font-size='9' font-weight='bold' text-anchor='middle' font-family='sans-serif'>CONCEPTS</text><text x='60' y='125' fill='%2394A3B8' font-size='7' text-anchor='middle' font-family='sans-serif'>Silberschatz</text></svg>",
    description: "Intended for a first course in databases at the junior or senior undergraduate, or first-year graduate level.",
    addedOn: "20 Jan 2024",
    lastUpdated: "22 Apr 2025",
    addedBy: "Admin User"
  },
  {
    id: 5,
    title: "Deep Work",
    subtitle: "Rules for Focused Success in a Distracted World",
    author: "Cal Newport",
    coAuthor: "",
    isbn: "978-1455586691",
    publisher: "Grand Central Publishing",
    category: "Productivity",
    language: "English",
    pubYear: "2016",
    edition: "1st Edition",
    totalCopies: 7,
    availableCopies: 4,
    status: "Available",
    shelf: "C-01-02",
    rack: "01",
    pages: 304,
    dimensions: "14.0 x 2.3 x 21.1 cm",
    weight: "0.40 kg",
    cover: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160' viewBox='0 0 120 160'><rect width='100%' height='100%' fill='%23F59E0B'/><text x='60' y='65' fill='%23000000' font-size='14' font-weight='900' text-anchor='middle' font-family='sans-serif'>DEEP</text><text x='60' y='85' fill='%23000000' font-size='14' font-weight='900' text-anchor='middle' font-family='sans-serif'>WORK</text><text x='60' y='125' fill='%231F2937' font-size='8' font-weight='bold' text-anchor='middle' font-family='sans-serif'>Cal Newport</text></svg>",
    description: "Deep work is the ability to focus without distraction on a cognitively demanding task.",
    addedOn: "01 Feb 2024",
    lastUpdated: "18 May 2025",
    addedBy: "Admin User"
  },
  {
    id: 6,
    title: "Introduction to Algorithms",
    subtitle: "The comprehensive textbook on computer algorithms",
    author: "Thomas H. Cormen",
    coAuthor: "Charles E. Leiserson",
    isbn: "978-0262033848",
    publisher: "MIT Press",
    category: "Computer Science",
    language: "English",
    pubYear: "2009",
    edition: "3rd Edition",
    totalCopies: 6,
    availableCopies: 2,
    status: "Low Stock",
    shelf: "A-01-01",
    rack: "01",
    pages: 1312,
    dimensions: "20.6 x 5.7 x 23.4 cm",
    weight: "2.10 kg",
    cover: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160' viewBox='0 0 120 160'><rect width='100%' height='100%' fill='%23FFFFFF'/><rect x='8' y='8' width='104' height='144' fill='none' stroke='%23DC2626' stroke-width='2'/><path d='M30 40 L90 40 M30 60 L90 120 M90 60 L30 120' stroke='%23DC2626' stroke-width='1.5'/><text x='60' y='75' fill='%23000000' font-size='8' font-weight='bold' text-anchor='middle' font-family='sans-serif'>ALGORITHMS</text><text x='60' y='135' fill='%2364748B' font-size='7' text-anchor='middle' font-family='sans-serif'>Cormen et al.</text></svg>",
    description: "Covers a broad range of algorithms in depth, yet makes their design and analysis accessible to all levels of readers.",
    addedOn: "05 Feb 2024",
    lastUpdated: "20 May 2025",
    addedBy: "Admin User"
  },
  {
    id: 7,
    title: "Harry Potter and the Philosopher's Stone",
    subtitle: "Book 1 in the Harry Potter Series",
    author: "J.K. Rowling",
    coAuthor: "",
    isbn: "978-0747532743",
    publisher: "Bloomsbury",
    category: "Fantasy",
    language: "English",
    pubYear: "1997",
    edition: "1st Edition",
    totalCopies: 12,
    availableCopies: 9,
    status: "Available",
    shelf: "B-01-03",
    rack: "04",
    pages: 223,
    dimensions: "13.2 x 2.0 x 19.8 cm",
    weight: "0.28 kg",
    cover: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160' viewBox='0 0 120 160'><rect width='100%' height='100%' fill='%231E1B4B'/><polygon points='60,30 70,55 95,60 75,78 80,105 60,90 40,105 45,78 25,60 50,55' fill='%23F59E0B'/><text x='60' y='125' fill='%23FFFFFF' font-size='8' font-weight='bold' text-anchor='middle' font-family='sans-serif'>HARRY POTTER</text><text x='60' y='140' fill='%23CBD5E1' font-size='7' text-anchor='middle' font-family='sans-serif'>J.K. Rowling</text></svg>",
    description: "Harry Potter has never even heard of Hogwarts when the letters start dropping on the doormat at number four, Privet Drive.",
    addedOn: "10 Feb 2024",
    lastUpdated: "01 Jun 2025",
    addedBy: "Admin User"
  }
];
*/

const apiBase = window.location.port === '8000' ? '' : 'http://127.0.0.1:8000';
let selectedDeleteBookId = null;
let currentActiveView = "view-list";
let bookCategories = [];
let bookLanguages = [];

// Initialize UI
document.addEventListener("DOMContentLoaded", () => {
  fetchBooks();
  setupEventListeners();
});

// Fetch books from backend API
async function fetchBooks() {
  try {
    const res = await fetch(`${apiBase}/api/admin/books`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.books)) {
        booksData = data.books;
      }
      bookCategories = Array.isArray(data.categories)
        ? data.categories.filter(Boolean)
        : [...new Set(booksData.map(book => book.category).filter(Boolean))].sort();
      bookLanguages = Array.isArray(data.languages)
        ? data.languages.filter(Boolean)
        : [...new Set(booksData.map(book => book.language).filter(Boolean))].sort();
      populateCategoryOptions();
      updateStatsCounters(data.stats);
    } else {
      updateStatsCounters();
    }
  } catch (err) {
    console.error('Backend books API unavailable:', err);
    booksData = [];
    updateStatsCounters({ total: 0, available: 0, issued: 0, lowStock: 0 });
    showToast("Could not load books from the database. Start the backend and try again.", "danger");
  }
  renderBooksTable();
}

function populateCategoryOptions() {
  const filter = document.getElementById("table-category-filter");
  const addSelect = document.getElementById("add-book-category");
  const editSelect = document.getElementById("edit-book-category");
  const currentFilter = filter?.value || "All";
  const currentAdd = addSelect?.value || "";
  const currentEdit = editSelect?.value || "";

  if (filter) {
    filter.innerHTML = '<option value="All">All Categories</option>';
      bookCategories.forEach(category => {
        filter.add(new Option(category, category));
      });
    filter.value = bookCategories.includes(currentFilter) ? currentFilter : "All";
  }

  [addSelect, editSelect].forEach(select => {
    if (!select) return;
    select.innerHTML = '<option value="">Select category</option>';
    bookCategories.forEach(category => {
      select.add(new Option(category, category));
    });
    if (select === addSelect) {
      select.add(new Option("+ Add new category", "__new__"));
    }
  });

  if (addSelect) addSelect.value = currentAdd;
  if (editSelect) editSelect.value = currentEdit;

  const addLanguage = document.getElementById("add-book-language");
  const editLanguage = document.getElementById("edit-book-language");
  const currentAddLanguage = addLanguage?.value || "";
  const currentEditLanguage = editLanguage?.value || "";
  [addLanguage, editLanguage].forEach(select => {
    if (!select) return;
    select.innerHTML = '<option value="">Select language</option>';
    bookLanguages.forEach(language => select.add(new Option(language, language)));
    if (select === addLanguage) select.add(new Option("+ Add new language", "__new__"));
  });
  if (addLanguage) addLanguage.value = currentAddLanguage;
  if (editLanguage) editLanguage.value = currentEditLanguage;
}

// Switch Views Function
function switchView(viewId, bookIdToEdit = null) {
  const allViews = document.querySelectorAll(".view-section");
  allViews.forEach(v => v.classList.remove("active-view"));

  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.add("active-view");
    currentActiveView = viewId;
  }

  const backBtn = document.getElementById("header-back-btn");
  const pageTitle = document.getElementById("page-header-title");
  const pageSubtitle = document.getElementById("page-header-subtitle");

  if (viewId === "view-list") {
    if (backBtn) backBtn.style.display = "none";
    if (pageTitle) pageTitle.textContent = "Book Management";
    if (pageSubtitle) pageSubtitle.textContent = "Manage library books, inventory and availability";
    renderBooksTable();
  } else if (viewId === "view-add") {
    if (backBtn) backBtn.style.display = "flex";
    if (pageTitle) pageTitle.textContent = "Add New Book";
    if (pageSubtitle) pageSubtitle.textContent = "Add a new book to the library collection";
    resetAddForm();
  } else if (viewId === "view-edit") {
    if (backBtn) backBtn.style.display = "flex";
    if (pageTitle) pageTitle.textContent = "Update Book";
    if (pageSubtitle) pageSubtitle.textContent = "Edit and update book information";
    if (bookIdToEdit) populateEditForm(bookIdToEdit);
  } else if (viewId === "view-availability") {
    if (backBtn) backBtn.style.display = "flex";
    if (pageTitle) pageTitle.textContent = "Check Book Availability";
    if (pageSubtitle) pageSubtitle.textContent = "Search and view real-time availability of books in the library";
    renderAvailabilityTable();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Expose functions globally for inline HTML onclick handlers
window.switchView = switchView;
window.saveNewBook = saveNewBook;
window.saveUpdatedBook = saveUpdatedBook;
window.populateEditForm = populateEditForm;
window.openDeleteModal = openDeleteModal;
window.closeDeleteModal = closeDeleteModal;
window.confirmDeleteBook = confirmDeleteBook;
window.resetAddForm = resetAddForm;
window.handleCSVImport = handleCSVImport;
window.downloadSampleCSV = downloadSampleCSV;
window.renderAvailabilityTable = renderAvailabilityTable;

// Event Listeners Setup
function setupEventListeners() {
  // Add Book & Check Availability direct button handlers
  document.querySelectorAll("button").forEach(btn => {
    const text = (btn.innerText || btn.textContent || "").trim().toLowerCase();
    if (text.includes("add book") && btn.type !== "submit") {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        switchView("view-add");
      });
    } else if (text.includes("check availability")) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        switchView("view-availability");
      });
    }
  });

  // Navigation back button
  const backBtn = document.getElementById("header-back-btn");
  if (backBtn) {
    backBtn.addEventListener("click", () => switchView("view-list"));
  }

  // Sidebar Logout prompt
  const logoutBtn = document.getElementById("sidebar-logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (confirm("Are you sure you want to log out from Admin Panel?")) {
        showToast("Logged out successfully", "success");
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    });
  }

  // Search and Filter Listeners
  const searchInput = document.getElementById("table-search-input");
  const categoryFilter = document.getElementById("table-category-filter");
  const availabilityFilter = document.getElementById("table-availability-filter");
  const addCategory = document.getElementById("add-book-category");
  const addLanguage = document.getElementById("add-book-language");

  if (searchInput) searchInput.addEventListener("input", () => { tableCurrentPage = 1; renderBooksTable(); });
  if (categoryFilter) categoryFilter.addEventListener("change", () => { tableCurrentPage = 1; renderBooksTable(); });
  if (availabilityFilter) availabilityFilter.addEventListener("change", () => { tableCurrentPage = 1; renderBooksTable(); });
  if (addCategory) addCategory.addEventListener("change", toggleNewCategoryInput);
  if (addLanguage) addLanguage.addEventListener("change", toggleNewLanguageInput);

  // Description character counter
  const descTextarea = document.getElementById("add-book-desc");
  const charCounter = document.getElementById("add-desc-counter");
  if (descTextarea && charCounter) {
    descTextarea.addEventListener("input", (e) => {
      charCounter.textContent = `${e.target.value.length} / 500`;
    });
  }

  const editDescTextarea = document.getElementById("edit-book-desc");
  const editCharCounter = document.getElementById("edit-desc-counter");
  if (editDescTextarea && editCharCounter) {
    editDescTextarea.addEventListener("input", (e) => {
      editCharCounter.textContent = `${e.target.value.length} / 500`;
    });
  }

  // Book cover upload handling
  setupImageUpload("add-cover-file-input", "add-cover-preview-img");
  setupImageUpload("edit-cover-file-input", "edit-cover-preview-img");

  // Save Book Form Submission
  const addBookForm = document.getElementById("add-book-form");
  if (addBookForm) {
    addBookForm.addEventListener("submit", (e) => {
      e.preventDefault();
      saveNewBook();
    });
  }

  // Update Book Form Submission
  const editBookForm = document.getElementById("edit-book-form");
  if (editBookForm) {
    editBookForm.addEventListener("submit", (e) => {
      e.preventDefault();
      saveUpdatedBook();
    });
  }
}

// Render Main Books Table
function renderBooksTable() {
  const tbody = document.getElementById("books-table-body");
  if (!tbody) return;

  const searchVal = (document.getElementById("table-search-input")?.value || "").toLowerCase().trim();
  const categoryVal = document.getElementById("table-category-filter")?.value || "All";
  const availVal = document.getElementById("table-availability-filter")?.value || "All";

  const filtered = booksData.filter(book => {
    const matchesSearch = !searchVal || 
      book.title.toLowerCase().includes(searchVal) ||
      book.author.toLowerCase().includes(searchVal) ||
      book.isbn.toLowerCase().includes(searchVal);

    const matchesCategory = categoryVal === "All" || book.category === categoryVal;
    const matchesAvail = availVal === "All" || book.status.toLowerCase().replace(/\s+/g, '') === availVal.toLowerCase().replace(/\s+/g, '');

    return matchesSearch && matchesCategory && matchesAvail;
  });

  const totalFilteredCount = filtered.length;
  const totalTablePages = Math.ceil(totalFilteredCount / TABLE_BOOKS_PER_PAGE) || 1;

  if (tableCurrentPage > totalTablePages) tableCurrentPage = totalTablePages;
  if (tableCurrentPage < 1) tableCurrentPage = 1;

  const startIdx = (tableCurrentPage - 1) * TABLE_BOOKS_PER_PAGE;
  const endIdx = startIdx + TABLE_BOOKS_PER_PAGE;
  const pageBooks = filtered.slice(startIdx, endIdx);

  if (totalFilteredCount === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" style="text-align: center; padding: 40px; color: #64748B;">
          <i class="fa-solid fa-folder-open" style="font-size: 2rem; margin-bottom: 8px; color: #CBD5E1;"></i>
          <p style="font-weight: 600;">No books found matching your criteria</p>
        </td>
      </tr>
    `;
    const footerText = document.getElementById("table-footer-info");
    if (footerText) footerText.textContent = `Showing 0 to 0 of 0 books`;
    renderTablePagination(1);
    return;
  }

  tbody.innerHTML = pageBooks.map(book => {
    let badgeClass = "badge-available";
    if (book.status === "Issued") badgeClass = "badge-issued";
    if (book.status === "Low Stock") badgeClass = "badge-lowstock";

    return `
      <tr>
        <td>
          <img src="${book.cover}" alt="${book.title}" class="book-cover-thumb" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'120\\' height=\\'160\\' viewBox=\\'0 0 120 160\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%233D539F\\'/><text x=\\'60\\' y=\\'80\\' fill=\\'%23FFFFFF\\' font-size=\\'10\\' font-weight=\\'bold\\' text-anchor=\\'middle\\'>BOOK</text></svg>'" />
        </td>
        <td>
          <div class="book-title-cell">
            <span class="book-main-title">${escapeHtml(book.title)}</span>
            <span class="book-subtitle">${escapeHtml(book.subtitle || "")}</span>
          </div>
        </td>
        <td style="font-weight: 500;">${escapeHtml(book.author)}</td>
        <td class="isbn-code">${escapeHtml(book.isbn)}</td>
        <td style="color: #64748B;">${escapeHtml(book.accessionNumber || "-")}</td>
        <td style="color: #64748B;">${escapeHtml(book.classNumber || "-")}</td>
        <td style="font-weight: 600;">₹${book.price !== undefined && book.price !== null ? book.price : 0}</td>
        <td><span class="category-tag">${escapeHtml(book.category)}</span></td>
        <td style="font-weight: 600;">${book.totalCopies}</td>
        <td style="font-weight: 700; color: ${book.availableCopies === 0 ? '#DC2626' : (book.availableCopies <= 2 ? '#EA580C' : '#16A34A')};">
          ${book.availableCopies}
        </td>
        <td>
          <span class="status-badge ${badgeClass}">${book.status}</span>
        </td>
        <td>
          <div class="action-group">
            <button class="action-btn action-view" title="Check Availability" onclick="switchView('view-availability')">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="action-btn action-edit" title="Update Book" onclick="switchView('view-edit', '${book.id}')">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="action-btn action-delete" title="Delete Book" onclick="openDeleteModal('${book.id}')">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  const startNum = startIdx + 1;
  const endNum = Math.min(endIdx, totalFilteredCount);
  const footerText = document.getElementById("table-footer-info");
  if (footerText) {
    footerText.textContent = `Showing ${startNum} to ${endNum} of ${totalFilteredCount} books`;
  }

  renderTablePagination(totalTablePages);
}

function renderTablePagination(totalTablePages) {
  const container = document.getElementById("table-pagination-container");
  if (!container) return;

  if (totalTablePages <= 1) {
    container.innerHTML = `<button class="page-btn active">1</button>`;
    return;
  }

  let html = "";
  const prevDisabled = tableCurrentPage === 1;
  html += `
    <button class="page-btn ${prevDisabled ? 'disabled' : ''}" ${prevDisabled ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : 'onclick="changeTablePage(' + (tableCurrentPage - 1) + ')"'}>
      &laquo;
    </button>
  `;

  for (let p = 1; p <= totalTablePages; p++) {
    const isActive = p === tableCurrentPage;
    html += `
      <button class="page-btn ${isActive ? 'active' : ''}" onclick="changeTablePage(${p})">
        ${p}
      </button>
    `;
  }

  const nextDisabled = tableCurrentPage === totalTablePages;
  html += `
    <button class="page-btn ${nextDisabled ? 'disabled' : ''}" ${nextDisabled ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : 'onclick="changeTablePage(' + (tableCurrentPage + 1) + ')"'}>
      &raquo;
    </button>
  `;

  container.innerHTML = html;
}

function changeTablePage(newPage) {
  tableCurrentPage = newPage;
  renderBooksTable();
  const tableCard = document.querySelector(".table-card");
  if (tableCard) {
    tableCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

window.changeTablePage = changeTablePage;

// Render Availability Table
function renderAvailabilityTable() {
  const tbody = document.getElementById("availability-table-body");
  if (!tbody) return;

  const searchVal = (document.getElementById("avail-search-input")?.value || "").toLowerCase().trim();
  const filtered = booksData.filter(book => {
    const matchesSearch = !searchVal || 
      book.title.toLowerCase().includes(searchVal) ||
      book.author.toLowerCase().includes(searchVal) ||
      book.isbn.toLowerCase().includes(searchVal);
    return matchesSearch;
  });

  const resultCount = document.getElementById("availability-results-count");
  const footerInfo = document.getElementById("availability-footer-info");
  if (resultCount) resultCount.textContent = `${filtered.length} books found`;
  if (footerInfo) footerInfo.textContent = `Showing ${filtered.length} books`;

  tbody.innerHTML = filtered.map(book => {
    const pct = book.totalCopies > 0 ? Math.round((book.availableCopies / book.totalCopies) * 100) : 0;
    let dotClass = "dot-green";
    let statusText = "Available";
    let pctText = `${pct}%`;

    if (book.availableCopies === 0) {
      dotClass = "dot-red";
      statusText = "Not Available";
      pctText = "0%";
    } else if (pct <= 50) {
      dotClass = "dot-orange";
      statusText = "Low Stock";
    }

    let badgeClass = "badge-available";
    if (book.status === "Issued") badgeClass = "badge-issued";
    if (book.status === "Low Stock") badgeClass = "badge-lowstock";

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 12px;">
            <img src="${book.cover}" alt="${book.title}" class="book-cover-thumb" />
            <div class="book-title-cell">
              <span class="book-main-title">${escapeHtml(book.title)}</span>
              <span class="book-subtitle">${escapeHtml(book.author)}</span>
            </div>
          </div>
        </td>
        <td class="isbn-code">${escapeHtml(book.isbn)}</td>
        <td style="font-weight: 600;">${book.totalCopies}</td>
        <td style="font-weight: 700; color: ${book.availableCopies === 0 ? '#DC2626' : '#16A34A'};">${book.availableCopies}</td>
        <td><span class="status-badge ${badgeClass}">${book.status}</span></td>
        <td>
          <div class="avail-progress-cell">
            <span class="avail-status-text">
              <i class="fa-solid fa-circle ${dotClass}" style="font-size: 0.65rem;"></i>
              ${statusText}
            </span>
            <span style="font-size: 0.775rem; color: #64748B; font-weight: 600;">${pctText}</span>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Update Stats Cards Counter Values
function updateStatsCounters(apiStats = null) {
  const totalEl = document.getElementById("stat-total-books");
  const availEl = document.getElementById("stat-available-books");
  const issuedEl = document.getElementById("stat-issued-books");
  const lowEl = document.getElementById("stat-lowstock-books");

  if (apiStats) {
    if (totalEl) totalEl.textContent = (apiStats.total || 0).toLocaleString();
    if (availEl) availEl.textContent = (apiStats.available || 0).toLocaleString();
    if (issuedEl) issuedEl.textContent = (apiStats.issued || 0).toLocaleString();
    if (lowEl) lowEl.textContent = (apiStats.lowStock || 0).toLocaleString();
    return;
  }

  const total = booksData.length;
  const available = booksData.reduce((acc, b) => acc + (parseInt(b.availableCopies) || 0), 0);
  const issued = booksData.reduce((acc, b) => acc + ((parseInt(b.totalCopies) || 0) - (parseInt(b.availableCopies) || 0)), 0);
  const lowStock = booksData.filter(b => b.status === "Low Stock" || (parseInt(b.availableCopies) || 0) <= 2).length;

  if (totalEl) totalEl.textContent = total.toLocaleString();
  if (availEl) availEl.textContent = available.toLocaleString();
  if (issuedEl) issuedEl.textContent = issued.toLocaleString();
  if (lowEl) lowEl.textContent = lowStock.toLocaleString();
}

// Save New Book
async function saveNewBook() {
  const title = document.getElementById("add-book-title")?.value.trim();
  const author = document.getElementById("add-book-author")?.value.trim();
  const isbn = document.getElementById("add-book-isbn")?.value.trim();
  const publisher = document.getElementById("add-book-publisher")?.value.trim();
  const categorySelect = document.getElementById("add-book-category");
  const newCategory = document.getElementById("add-new-category")?.value.trim();
  const category = categorySelect?.value === "__new__" ? newCategory : categorySelect?.value;
  const languageSelect = document.getElementById("add-book-language");
  const newLanguage = document.getElementById("add-new-language")?.value.trim();
  const language = languageSelect?.value === "__new__" ? newLanguage : languageSelect?.value;
  const totalCopies = parseInt(document.getElementById("add-book-copies")?.value || "1");

  if (!title || !author || !isbn || !category || !language) {
    showToast("Please fill in all required fields (*)", "danger");
    return;
  }

  const payload = {
    title: title,
    subtitle: document.getElementById("add-book-subtitle")?.value.trim() || "",
    author: author,
    coAuthor: document.getElementById("add-book-coauthor")?.value.trim() || "",
    isbn: isbn,
    accessionNumber: document.getElementById("add-book-accession")?.value.trim() || "",
    classNumber: document.getElementById("add-book-classnum")?.value.trim() || "",
    price: parseFloat(document.getElementById("add-book-price")?.value || "0"),
    publisher: publisher || "General",
    category: category,
    language: language,
    pubYear: document.getElementById("add-book-year")?.value || "2024",
    edition: document.getElementById("add-book-edition")?.value || "1st Edition",
    totalCopies: totalCopies,
    shelf: document.getElementById("add-book-shelf")?.value || "A-01-01",
    rack: document.getElementById("add-book-rack")?.value || "01",
    pages: document.getElementById("add-book-pages")?.value || "300",
    dimensions: document.getElementById("add-book-dimensions")?.value || "15 x 22 cm",
    weight: document.getElementById("add-book-weight")?.value || "0.4 kg",
    cover: document.getElementById("add-cover-preview-img")?.src || null,
    description: document.getElementById("add-book-desc")?.value || ""
  };

  try {
    const res = await fetch(`${apiBase}/api/admin/books`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const resData = await res.json();
    if (!res.ok) throw new Error(resData.detail || "Failed to add book");

    showToast(resData.message || `"${title}" added to library successfully!`, "success");
    await fetchBooks();
    switchView("view-list");
  } catch (err) {
    console.error("Save book error:", err);
    showToast(err.message || "Failed to save book to backend", "danger");
  }
}

// Populate Edit Form
function populateEditForm(bookId) {
  const book = booksData.find(b => String(b.id) === String(bookId));
  if (!book) return;

  document.getElementById("edit-book-id").value = book.id;
  document.getElementById("edit-book-title").value = book.title || "";
  document.getElementById("edit-book-subtitle").value = book.subtitle || "";
  document.getElementById("edit-book-author").value = book.author || "";
  document.getElementById("edit-book-coauthor").value = book.coAuthor || "";
  document.getElementById("edit-book-isbn").value = book.isbn || "";
  if (document.getElementById("edit-book-accession")) document.getElementById("edit-book-accession").value = book.accessionNumber || "";
  if (document.getElementById("edit-book-classnum")) document.getElementById("edit-book-classnum").value = book.classNumber || "";
  if (document.getElementById("edit-book-price")) document.getElementById("edit-book-price").value = book.price !== undefined && book.price !== null ? book.price : 0;
  document.getElementById("edit-book-publisher").value = book.publisher || "";
  document.getElementById("edit-book-category").value = book.category || "Computer Science";
  document.getElementById("edit-book-language").value = book.language || "English";
  document.getElementById("edit-book-year").value = book.pubYear || "";
  document.getElementById("edit-book-edition").value = book.edition || "";
  document.getElementById("edit-book-copies").value = book.totalCopies || 1;
  document.getElementById("edit-book-shelf").value = book.shelf || "";
  document.getElementById("edit-book-rack").value = book.rack || "";
  document.getElementById("edit-book-desc").value = book.description || "";
  document.getElementById("edit-book-pages").value = book.pages || "";
  document.getElementById("edit-book-dimensions").value = book.dimensions || "";
  document.getElementById("edit-book-weight").value = book.weight || "";

  const coverImg = document.getElementById("edit-cover-preview-img");
  if (coverImg && book.cover) coverImg.src = book.cover;

  const summaryStatus = document.getElementById("edit-summary-status");
  if (summaryStatus) summaryStatus.textContent = book.status;

  const summaryAvail = document.getElementById("edit-summary-avail");
  if (summaryAvail) summaryAvail.textContent = book.availableCopies;

  const summaryIssued = document.getElementById("edit-summary-issued");
  if (summaryIssued) summaryIssued.textContent = book.totalCopies - book.availableCopies;
}

// Save Updated Book
async function saveUpdatedBook() {
  const bookId = document.getElementById("edit-book-id").value;
  if (!bookId) return;

  const title = document.getElementById("edit-book-title").value.trim();
  const author = document.getElementById("edit-book-author").value.trim();
  const isbn = document.getElementById("edit-book-isbn").value.trim();

  if (!title || !author || !isbn) {
    showToast("Please fill in all required fields (*)", "danger");
    return;
  }

  const payload = {
    title: title,
    subtitle: document.getElementById("edit-book-subtitle").value.trim(),
    author: author,
    coAuthor: document.getElementById("edit-book-coauthor").value.trim(),
    isbn: isbn,
    accessionNumber: document.getElementById("edit-book-accession")?.value.trim() || "",
    classNumber: document.getElementById("edit-book-classnum")?.value.trim() || "",
    price: parseFloat(document.getElementById("edit-book-price")?.value || "0"),
    publisher: document.getElementById("edit-book-publisher").value.trim(),
    category: document.getElementById("edit-book-category").value,
    language: document.getElementById("edit-book-language").value,
    pubYear: document.getElementById("edit-book-year").value,
    edition: document.getElementById("edit-book-edition").value,
    totalCopies: parseInt(document.getElementById("edit-book-copies").value || "1"),
    shelf: document.getElementById("edit-book-shelf").value,
    rack: document.getElementById("edit-book-rack").value,
    description: document.getElementById("edit-book-desc").value,
    pages: document.getElementById("edit-book-pages").value,
    dimensions: document.getElementById("edit-book-dimensions").value,
    weight: document.getElementById("edit-book-weight").value,
    cover: document.getElementById("edit-cover-preview-img")?.src
  };

  try {
    const res = await fetch(`${apiBase}/api/admin/books/${bookId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const resData = await res.json();
    if (!res.ok) throw new Error(resData.detail || "Failed to update book");

    showToast(resData.message || `"${title}" updated successfully!`, "success");
    await fetchBooks();
    switchView("view-list");
  } catch (err) {
    console.error("Update book error:", err);
    showToast(err.message || "Failed to update book in backend", "danger");
  }
}

// Open Delete Confirmation Modal
function openDeleteModal(bookId) {
  const book = booksData.find(b => String(b.id) === String(bookId));
  if (!book) return;

  selectedDeleteBookId = bookId;
  const modalImg = document.getElementById("delete-modal-img");
  const modalTitle = document.getElementById("delete-modal-title");
  const modalAuthor = document.getElementById("delete-modal-author");
  const modalIsbn = document.getElementById("delete-modal-isbn");

  if (modalImg) modalImg.src = book.cover;
  if (modalTitle) modalTitle.textContent = book.title;
  if (modalAuthor) modalAuthor.textContent = `Author: ${book.author}`;
  if (modalIsbn) modalIsbn.textContent = `ISBN: ${book.isbn}`;

  const overlay = document.getElementById("delete-modal-overlay");
  if (overlay) overlay.classList.add("modal-active");
}

// Close Delete Confirmation Modal
function closeDeleteModal() {
  const overlay = document.getElementById("delete-modal-overlay");
  if (overlay) overlay.classList.remove("modal-active");
  selectedDeleteBookId = null;
}

// Confirm Delete Book
async function confirmDeleteBook() {
  if (!selectedDeleteBookId) return;

  const book = booksData.find(b => String(b.id) === String(selectedDeleteBookId));
  
  try {
    const res = await fetch(`${apiBase}/api/admin/books/${selectedDeleteBookId}`, {
      method: 'DELETE'
    });
    const resData = await res.json();
    if (!res.ok) throw new Error(resData.detail || "Failed to delete book");

    showToast(resData.message || `"${book ? book.title : 'Book'}" deleted from system.`, "danger");
    await fetchBooks();
    closeDeleteModal();
  } catch (err) {
    console.error("Delete book error:", err);
    showToast(err.message || "Failed to delete book from backend", "danger");
  }
}

// Image Upload Preview Helper
function setupImageUpload(inputId, previewImgId) {
  const fileInput = document.getElementById(inputId);
  const previewImg = document.getElementById(previewImgId);

  if (!fileInput || !previewImg) return;

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(evt) {
        previewImg.src = evt.target.result;
      };
      reader.readAsDataURL(file);
    }
  });
}

// Reset Add Form
function resetAddForm() {
  const form = document.getElementById("add-book-form");
  if (form) form.reset();
  toggleNewCategoryInput();
  toggleNewLanguageInput();
  const counter = document.getElementById("add-desc-counter");
  if (counter) counter.textContent = "0 / 500";
}

function toggleNewLanguageInput() {
  const select = document.getElementById("add-book-language");
  const input = document.getElementById("add-new-language");
  if (!select || !input) return;

  const isNewLanguage = select.value === "__new__";
  input.style.display = isNewLanguage ? "block" : "none";
  input.required = isNewLanguage;
  if (!isNewLanguage) input.value = "";
}

function toggleNewCategoryInput() {
  const select = document.getElementById("add-book-category");
  const input = document.getElementById("add-new-category");
  if (!select || !input) return;

  const isNewCategory = select.value === "__new__";
  input.style.display = isNewCategory ? "block" : "none";
  input.required = isNewCategory;
  if (!isNewCategory) input.value = "";
}

// Toast Notifications
function showToast(message, type = "success") {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Escape HTML Helper
function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}

// Handle CSV File Selection
function handleCSVImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.name.endsWith('.csv')) {
    showToast("Please upload a valid .csv file!", "danger");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    parseAndImportCSV(text);
  };
  reader.readAsText(file);
  event.target.value = '';
}

// Parse CSV and import books into booksData
async function parseAndImportCSV(csvText) {
  const lines = csvText.split(/\r\n|\n/).filter(line => line.trim() !== "");
  if (lines.length <= 1) {
    showToast("CSV file is empty or missing data rows!", "danger");
    return;
  }

  const parseLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase());
  const importList = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length < 2) continue;

    const rowObj = {};
    headers.forEach((h, index) => {
      rowObj[h] = values[index] || "";
    });

    const title = rowObj["title"] || values[0] || "Untitled Book";
    const author = rowObj["author"] || values[1] || "Unknown Author";
    const isbn = rowObj["isbn"] || values[2] || `978-${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    const category = rowObj["category"] || values[3] || "Computer Science";
    const totalCopies = parseInt(rowObj["totalcopies"] || rowObj["total copies"] || values[4] || "5");
    const publisher = rowObj["publisher"] || values[5] || "Library Press";

    importList.push({
      title: title,
      subtitle: rowObj["subtitle"] || "",
      author: author,
      coAuthor: rowObj["coauthor"] || rowObj["co-author"] || "",
      isbn: isbn,
      publisher: publisher,
      category: category,
      language: rowObj["language"] || "English",
      pubYear: rowObj["pubyear"] || rowObj["publication year"] || "2024",
      edition: rowObj["edition"] || "1st Edition",
      totalCopies: totalCopies,
      shelf: rowObj["shelf"] || "A-01-01",
      rack: rowObj["rack"] || "01",
      pages: rowObj["pages"] || "300",
      dimensions: rowObj["dimensions"] || "15 x 22 cm",
      weight: rowObj["weight"] || "0.4 kg",
      cover: null,
      description: rowObj["description"] || "Imported via CSV file upload."
    });
  }

  if (importList.length === 0) {
    showToast("No valid book rows found in CSV file.", "danger");
    return;
  }

  try {
    const res = await fetch(`${apiBase}/api/admin/books/import-csv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(importList)
    });
    const resData = await res.json();
    if (!res.ok) throw new Error(resData.detail || "Import failed");

    showToast(resData.message || `Successfully imported ${importList.length} books!`, "success");
    await fetchBooks();
    switchView("view-list");
  } catch (err) {
    console.error("CSV import error:", err);
    showToast(err.message || "Failed to import books via CSV", "danger");
  }
}

// Download Sample CSV Template
function downloadSampleCSV() {
  const csvContent = "Title,Author,ISBN,Category,Total Copies,Publisher,Subtitle,Publication Year\n" +
    '"Design Patterns","Erich Gamma","978-0201633610","Computer Science",10,"Addison-Wesley","Elements of Reusable Object-Oriented Software",1994\n' +
    '"The Pragmatic Programmer","Andrew Hunt","978-0135957059","Computer Science",8,"Addison-Wesley","Your Journey to Mastery",2019\n' +
    '"Thinking, Fast and Slow","Daniel Kahneman","978-0374533557","Self Help",6,"Farrar, Straus and Giroux","",2011';

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "sample_library_books.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Downloaded sample_library_books.csv template!", "success");
}
