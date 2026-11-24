/**
 * src/main.js - Smart Library Book Recommendation Module
 * Interactive logic for multi-page navigation (Author Page, Alternate Books Page,
 * Borrowing History Page, Rating & Reviews Page) and universal Book Borrowing.
 */

// Self-contained inline SVG icon library - Zero npm/CDN dependency, 100% offline & robust in VS Code Live Server
const ICONS_SVG = {
  'user': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  'home': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  'calendar': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
  'star': '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  'clock': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  'book-open': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  'book-copy': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 17V4a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v13"/><path d="M22 20V7a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2z"/></svg>',
  'user-check': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>',
  'award': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
  'search': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  'armchair': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3"/><path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H7v-2a2 2 0 0 0-4 0z"/><path d="M5 18v2"/><path d="M19 18v2"/></svg>',
  'logout': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  'log-out': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  'bell': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  'sparkles': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>',
  'book-marked': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><polyline points="10 2 10 10 13 7 16 10 16 2"/></svg>',
  'history': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/><polyline points="12 7 12 12 15 15"/></svg>',
  'arrow-left': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  'refresh-cw': '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  'plus': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  'check-circle-2': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>',
  'external-link': '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>'
};

export function refreshIcons() {
  try {
    if (typeof document !== 'undefined') {
      document.querySelectorAll('i[data-lucide]').forEach(el => {
        const iconName = el.getAttribute('data-lucide');
        if (ICONS_SVG[iconName]) {
          el.innerHTML = ICONS_SVG[iconName];
          el.style.display = 'inline-flex';
          el.style.alignItems = 'center';
          el.style.justifyContent = 'center';
          el.style.lineHeight = '0';
        }
      });
    }
  } catch (err) {
    console.warn('Icons render notice:', err);
  }
}

if (typeof window !== 'undefined') {
  window.lucide = {
    createIcons: refreshIcons
  };
}

// =========================================================================
// 1. DATA: RECOMMENDED BOOKS & CATALOG
// =========================================================================
const apiBase = window.location.port === '8000' ? '' : 'http://127.0.0.1:8000';
export let recommendedBooks = [];
let borrowingHistoryData = [];
let recommendationProfile = {
  totalBorrowed: 0,
  averageRating: 0,
  favoriteAuthors: [],
  favoriteTopics: []
};

export async function fetchRecommendations() {
  document.getElementById("authorBooksGrid")?.replaceChildren();
  document.getElementById("alternatePageGrid")?.replaceChildren();
  document.getElementById("ratedBooksGrid")?.replaceChildren();
  const feed = document.getElementById("booksFeedList");
  if (feed) feed.innerHTML = '<div class="recommendation-loading">Loading recommendations from library database...</div>';
  try {
    const res = await fetch(`${apiBase}/api/student/recommendations`);
    if (!res.ok) throw new Error(`Recommendation API returned ${res.status}`);
    const data = await res.json();
    recommendedBooks = Array.isArray(data.recommendations) ? data.recommendations : [];
    borrowingHistoryData = Array.isArray(data.history) ? data.history : [];
    recommendationProfile = data.profile || recommendationProfile;
    selectedBookId = recommendedBooks[0]?.id || null;
    currentAlternateTargetId = recommendedBooks[0]?.id || null;
    currentAuthorName = recommendedBooks[0]?.author || "";
    updateProfileWidgets();
  } catch (err) {
    console.error("Failed to fetch database recommendations:", err);
    recommendedBooks = [];
    if (feed) {
      feed.innerHTML = `<div class="recommendation-error">Unable to load recommendations from the library database. <button onclick="window.fetchRecommendations()">Retry</button></div>`;
    }
  }
  updateDynamicFilters();
  renderBooks();
  if (recommendedBooks.length > 0) {
    selectBook(recommendedBooks[0].id);
  }
}

function updateProfileWidgets() {
  const totalBorrowed = document.getElementById("profileTotalBorrowed");
  if (totalBorrowed) totalBorrowed.textContent = recommendationProfile.totalBorrowed;

  const averageRating = document.getElementById("profileAverageRating");
  if (averageRating) averageRating.textContent = `${recommendationProfile.averageRating || 0} / 5`;

  const favoriteAuthors = document.getElementById("profileFavAuthors");
  if (favoriteAuthors) {
    favoriteAuthors.innerHTML = (recommendationProfile.favoriteAuthors || []).map(author =>
      `<span class="author-tag" onclick="window.openAuthorSpotlight('${author.replace(/'/g, "\\'")}')">${author}</span>`
    ).join('') || '<span class="profile-empty">No borrowing history yet</span>';
  }

  const favoriteTopics = document.getElementById("profileFavTopics");
  if (favoriteTopics) {
    favoriteTopics.innerHTML = (recommendationProfile.favoriteTopics || []).map(topic =>
      `<span class="topic-tag" onclick="window.filterByTag('${topic.replace(/'/g, "\\'")}')">${topic}</span>`
    ).join('') || '<span class="profile-empty">No topics yet</span>';
  }
}

export function updateDynamicFilters() {
  if (recommendedBooks.length === 0) return;

  const authorSelect = document.getElementById("filterAuthor");
  if (authorSelect) {
    const authors = Array.from(new Set(recommendedBooks.map(b => b.author)));
    authorSelect.innerHTML = `<option value="All">All Authors</option>` +
      authors.map(a => `<option value="${a}">${a}</option>`).join('');
  }

  const topicSelect = document.getElementById("filterTopic");
  if (topicSelect) {
    const topics = Array.from(new Set(recommendedBooks.flatMap(b => b.tags || []))).filter(Boolean);
    topicSelect.innerHTML = `<option value="All">All Topics</option>` +
      topics.map(t => `<option value="${t}">${t}</option>`).join('');
  }

  const altTargetSelect = document.getElementById("alternateTargetSelect");
  if (altTargetSelect) {
    altTargetSelect.innerHTML = recommendedBooks.map(b => `<option value="${b.id}">${b.title} (${b.author})</option>`).join('');
  }

  const reviewBookSelect = document.getElementById("reviewBookSelect");
  if (reviewBookSelect) {
    reviewBookSelect.innerHTML = recommendedBooks.map(b =>
      `<option value="${b.title}">${b.title} (${b.author})</option>`
    ).join('');
  }

  const favAuthorsEl = document.getElementById("profileFavAuthors");
  if (favAuthorsEl) {
    const topAuthors = recommendationProfile.favoriteAuthors || [];
    favAuthorsEl.innerHTML = topAuthors.map(a => `<span class="author-tag" onclick="window.openAuthorSpotlight('${a.replace(/'/g, "\\'")}')">${a}</span>`).join('');
  }

  const favTopicsEl = document.getElementById("profileFavTopics");
  if (favTopicsEl) {
    const topTopics = recommendationProfile.favoriteTopics || [];
    favTopicsEl.innerHTML = topTopics.map(t => `<span class="topic-tag" onclick="window.filterByTag('${t.replace(/'/g, "\\'")}')">${t}</span>`).join('');
  }

  const authorScroll = document.querySelector(".author-pills-scroll");
  if (authorScroll) {
    const authors = Array.from(new Set(recommendedBooks.map(b => b.author)));
    authorScroll.innerHTML = authors.map((a, idx) => `<button class="author-pill-btn ${idx === 0 ? 'active' : ''}" onclick="window.switchAuthor('${a.replace(/'/g, "\\'")}', this)">${a}</button>`).join('');
  }

  const totalBorrowed = document.getElementById("profileTotalBorrowed");
  if (totalBorrowed) {
    totalBorrowed.textContent = recommendationProfile.totalBorrowed;
  }
}



export function getAuthorData(authorName) {
  const authorBooks = recommendedBooks.filter(b => b.author.toLowerCase().includes((authorName || "").toLowerCase()));
  if (authorBooks.length === 0) {
    const fallbackName = authorName || (recommendedBooks[0] ? recommendedBooks[0].author : "Featured Author");
    return {
      name: fallbackName,
      initials: fallbackName.split(" ").map(n => n[0]).join("").toUpperCase(),
      bio: `${fallbackName} is a featured author in our library collection.`,
      booksCount: recommendedBooks.length,
      avgRating: "4.8 / 5",
      books: recommendedBooks.map(b => ({
        title: b.title,
        category: b.tags ? b.tags[0] : "General",
        rating: b.rating,
        copies: b.copiesAvailable,
        shelf: b.shelfLocation || "Not assigned",
        desc: b.desc
      }))
    };
  }
  const avgRate = (authorBooks.reduce((s, b) => s + b.rating, 0) / authorBooks.length).toFixed(1);
  return {
    name: authorBooks[0].author,
    initials: authorBooks[0].author.split(" ").map(n => n[0]).join("").toUpperCase(),
    bio: `Featured campus author of '${authorBooks[0].title}' in ${authorBooks[0].tags ? authorBooks[0].tags[0] : 'Library Collection'}.`,
    booksCount: authorBooks.length,
    avgRating: `${avgRate} / 5`,
    books: authorBooks.map(b => ({
      title: b.title,
      category: b.tags ? b.tags[0] : "General",
      rating: b.rating,
      copies: b.copiesAvailable,
      shelf: b.shelfLocation || "Not assigned",
      desc: b.desc
    }))
  };
}

let selectedBookId = 1;
let currentSearchQuery = "";
let currentTopic = "All";
let currentAuthor = "All";
let currentRating = "All";
let currentSort = "relevance";
let currentPage = "recommendations";
let currentAuthorName = "James Clear";
let currentAlternateTargetId = 1;

// =========================================================================
// 2. PAGE NAVIGATION ENGINE (NEW PAGES AS REQUESTED)
// =========================================================================
export function navigateToPage(pageName) {
  currentPage = pageName;
  document.body.classList.toggle("alternate-page-mode", pageName === "alternate");

  // 1. Hide all view sections
  const views = document.querySelectorAll(".page-view-section");
  views.forEach(v => {
    v.style.display = "none";
    v.classList.remove("active");
  });

  // 2. Show requested view section
  const targetView = document.getElementById(`view-${pageName}`);
  if (targetView) {
    targetView.style.display = "flex";
    targetView.classList.add("active");
  }

  // 3. Update breadcrumb text
  const breadcrumb = document.getElementById("currentViewBreadcrumb");
  if (breadcrumb) {
    const titles = {
      recommendations: "Book Recommendations",
      author: "Authors",
      alternate: "Alternate Books Engine",
      history: "Borrowing History & Loans",
      rating: "Ratings & Community Reviews"
    };
    breadcrumb.textContent = titles[pageName] || "Library Panel";
  }

  // 4. Update left sidebar active link
  const sidebarItems = document.querySelectorAll(".sidebar-menu .menu-item");
  sidebarItems.forEach(item => item.classList.remove("active"));

  if (pageName === "recommendations") {
    document.getElementById("nav-recommendation")?.classList.add("active");
  } else if (pageName === "author") {
    document.getElementById("nav-author")?.classList.add("active");
  } else if (pageName === "alternate") {
    document.getElementById("nav-alternate")?.classList.add("active");
  } else if (pageName === "history") {
    document.getElementById("nav-history")?.classList.add("active");
  } else if (pageName === "rating") {
    document.getElementById("nav-rating")?.classList.add("active");
  }

  // 5. Scroll smoothly to top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // 6. Trigger page-specific data renderers
  if (pageName === "author") {
    renderAuthorView();
  } else if (pageName === "alternate") {
    renderAlternatePageView();
  } else if (pageName === "history") {
    renderHistoryPageTable("all");
    updateHistoryRibbon();
  } else if (pageName === "rating") {
    renderRatingPageView("all");
  } else if (pageName === "recommendations") {
    renderBooks();
  }

  refreshIcons();
}

// =========================================================================
// 3. AUTHOR PAGE LOGIC & RENDER
// =========================================================================
export function openAuthorSpotlight(authorName) {
  currentAuthorName = authorName;
  navigateToPage("author");
}

export function switchAuthor(authorName, btnElement) {
  currentAuthorName = authorName;
  const buttons = document.querySelectorAll(".author-pills-scroll .author-pill-btn");
  buttons.forEach(b => b.classList.remove("active"));
  if (btnElement) btnElement.classList.add("active");

  renderAuthorView();
}

export function renderAuthorView() {
  const authorData = getAuthorData(currentAuthorName);

  const nameEl = document.getElementById("authorDisplayName");
  const subNameEl = document.getElementById("authorNameSub");
  const bioEl = document.getElementById("authorBioText");
  const letterEl = document.getElementById("authorAvatarLetter");
  const countEl = document.getElementById("authorBooksCount");
  const gridEl = document.getElementById("authorBooksGrid");

  if (nameEl) nameEl.textContent = authorData.name;
  if (subNameEl) subNameEl.textContent = authorData.name;
  if (bioEl) bioEl.textContent = authorData.bio;
  if (letterEl) letterEl.textContent = authorData.initials;
  if (countEl) countEl.textContent = authorData.books.length;

  if (gridEl) {
    gridEl.innerHTML = authorData.books.map(b => `
      <div class="author-book-card">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
            <span style="font-size:11px; font-weight:700; background:#eff4fe; color:#2355cf; padding:3px 8px; border-radius:6px;">${b.category}</span>
            <span style="font-size:12px; font-weight:700; color:#334155;">★ ${b.rating} / 5</span>
          </div>
          <h3 style="font-size:17px; font-weight:800; color:#1e293b; line-height:1.3;">${b.title}</h3>
          <p style="font-size:12px; color:#64748b; margin-top:2px;">by ${authorData.name}</p>
          <p style="font-size:13px; color:#475569; margin:12px 0; line-height:1.5;">${b.desc}</p>
          <div style="font-size:11px; color:#64748b; background:#f8fafc; padding:6px 10px; border-radius:8px; border:1px solid #f1f5f9;">
            📍 Location: <strong>${b.shelf}</strong>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-start; align-items:center; padding-top:12px; border-top:1px solid #f1f5f9;">
          <span style="font-size:12px; font-weight:700; color:#16a34a;">✓ ${b.copies} Available</span>
        </div>
      </div>
    `).join('');
  }

  refreshIcons();
}

// =========================================================================
// 4. ALTERNATE BOOKS PAGE LOGIC & RENDER
// =========================================================================
export function changeAlternateTargetBook(bookId) {
  currentAlternateTargetId = bookId;
  renderAlternatePageView();
}

export function shuffleAlternatePage() {
  const grid = document.getElementById("alternatePageGrid");
  if (grid) {
    const cards = Array.from(grid.children);
    cards.sort(() => Math.random() - 0.5);
    cards.forEach(c => grid.appendChild(c));
    showToast("Refreshed alternative recommendations");
  }
}

export function renderAlternatePageView() {
  const targetBook = recommendedBooks.find(b => b.id === currentAlternateTargetId) || recommendedBooks[0];
  const grid = document.getElementById("alternatePageGrid");
  if (!grid) return;

  const alternates = targetBook.alternateBooks || [];
  const colorThemes = ["alt-cover-blue", "alt-cover-emerald", "alt-cover-amber", "alt-cover-purple", "alt-cover-rose", "alt-cover-cyan"];

  grid.innerHTML = alternates.map((alt, idx) => {
    const themeClass = colorThemes[idx % colorThemes.length];
    const shelfLoc = alt.shelfLocation || "Not assigned";
    const safeTitle = JSON.stringify(alt.title);
    const safeAuthor = JSON.stringify(alt.author);
    const safeCategory = JSON.stringify(alt.category);
    return `
      <div class="alt-full-card">
        <div class="alt-card-header-bar">
          <span class="alt-category-pill">${alt.category}</span>
          <span class="alt-match-badge">⚡ ${alt.match}% Match</span>
        </div>

        <div class="alt-card-body">
          <div class="alt-book-presentation">
            <div class="alt-book-cover-mock ${themeClass}">
              <span class="alt-cover-spine-tag">Library</span>
              <span class="alt-cover-mini-title">${alt.title}</span>
              <span style="font-size:8px; opacity:0.8;">★ ${alt.rating}</span>
            </div>
            <div class="alt-info-wrap">
              <h3 class="alt-title">${alt.title}</h3>
              <p class="alt-author">by ${alt.author}</p>
              <div class="alt-rating-row">
                <span class="alt-rating-star">★</span>
                <span>${alt.rating} / 5</span>
                <span style="font-size:11px; color:#94a3b8; font-weight:normal;">• Verified</span>
              </div>
            </div>
          </div>

          <div class="alt-reason-box">
            💡 <strong>Why Similar:</strong> ${alt.whyAlternate}
          </div>

          <div class="alt-meta-chips">
            <span>📍 ${shelfLoc}</span>
            <span class="alt-copies-badge">✓ ${alt.copies} Available</span>
          </div>
        </div>

      </div>
    `;
  }).join('');

  refreshIcons();
}



// =========================================================================
// 6. RATING & REVIEWS PAGE LOGIC & RENDER
// =========================================================================
export function filterRatingCards(minRating, btnElement) {
  const buttons = document.querySelectorAll(".rate-filter-pills .rate-filter-pill");
  buttons.forEach(b => b.classList.remove("active"));
  if (btnElement) btnElement.classList.add("active");

  renderRatingPageView(minRating);
}

export function renderRatingPageView(filter = "all") {
  const grid = document.getElementById("ratedBooksGrid");
  if (!grid) return;

  const filtered = recommendedBooks.filter(book => {
    if (filter === "4.7") return book.rating >= 4.7;
    if (filter === "4.5") return book.rating >= 4.5;
    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div style="grid-column: span 3; text-align:center; padding:40px; color:#64748b;">No books found matching rating criteria.</div>`;
    return;
  }

  grid.innerHTML = filtered.map(b => `
    <div class="rated-book-card">
      <div>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <span style="background:#eff4fe; color:#2355cf; font-size:11px; font-weight:700; padding:3px 10px; border-radius:6px;">${b.tags ? b.tags[0] : 'General'}</span>
          <span style="font-size:13px; font-weight:800; color:#d97706;">★ ${b.rating} / 5</span>
        </div>

        <h3 style="font-size:18px; font-weight:800; color:#1e293b; line-height:1.3;">${b.title}</h3>
        <p style="font-size:12px; color:#64748b; margin-top:2px;">by ${b.author} • ${b.ratingsCount || '12'} reviews</p>

        <p style="font-size:13px; color:#475569; margin:12px 0; line-height:1.5;">${b.desc}</p>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; padding-top:14px; border-top:1px solid #f1f5f9;">
        <span style="font-size:12px; font-weight:700; color:#16a34a;">✓ ${b.copiesAvailable} Copies Available</span>
      </div>
    </div>
  `).join('');

  refreshIcons();
}

function bindReviewStars() {
  const picker = document.getElementById("reviewStarPicker");
  const valueInput = document.getElementById("reviewStarSelect");
  if (!picker || !valueInput) return;

  picker.querySelectorAll(".review-star-button").forEach(button => {
    button.addEventListener("click", () => {
      const rating = Number(button.dataset.rating);
      valueInput.value = String(rating);
      picker.querySelectorAll(".review-star-button").forEach(star => {
        star.classList.toggle("active", Number(star.dataset.rating) <= rating);
      });
    });
  });
}

async function saveStudentReview(bookName, stars, comment) {
  if (!stars) {
    showToast("Please select a star rating before submitting.");
    return false;
  }

  try {
    const response = await fetch(`${apiBase}/api/student/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookTitle: bookName, rating: stars, review: comment })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Unable to save review.");

    showToast(data.message || `Your ${stars}★ review has been saved.`);
    await fetchRecommendations();
    return true;
  } catch (error) {
    showToast(error.message);
    return false;
  }
}

export async function submitStudentReview() {
  const bookSelect = document.getElementById("reviewBookSelect");
  const starSelect = document.getElementById("reviewStarSelect");
  const commentInput = document.getElementById("reviewCommentInput");
  const bookName = bookSelect ? bookSelect.value : "Book";
  const stars = starSelect ? Number(starSelect.value) : 0;
  const comment = commentInput ? commentInput.value.trim() : "";
  const saved = await saveStudentReview(bookName, stars, comment);

  if (saved) {
    if (commentInput) commentInput.value = "";
    if (starSelect) starSelect.value = "0";
    document.querySelectorAll("#reviewStarPicker .review-star-button").forEach(star => star.classList.remove("active"));
  }
}

export function selectAlternateRating(button) {
  const picker = button.closest(".alt-review-stars");
  if (!picker) return;
  const rating = Number(button.dataset.rating);
  picker.dataset.selectedRating = String(rating);
  picker.querySelectorAll("button").forEach(star => {
    star.classList.toggle("active", Number(star.dataset.rating) <= rating);
  });
}

export async function submitAlternateReview(bookTitle, button) {
  const card = button.closest(".alt-review-box");
  const picker = card?.querySelector(".alt-review-stars");
  const comment = card?.querySelector(".alt-review-input")?.value.trim() || "";
  const rating = Number(picker?.dataset.selectedRating || 0);
  const saved = await saveStudentReview(bookTitle, rating, comment);
  if (saved && card) card.remove();
}

// =========================================================================
// 7. MAIN RECOMMENDATION FEED FUNCTIONS
// =========================================================================
export function getFilteredBooks() {
  return recommendedBooks
    .filter(book => {
      const matchesSearch =
        currentSearchQuery === "" ||
        book.title.toLowerCase().includes(currentSearchQuery.toLowerCase()) ||
        book.author.toLowerCase().includes(currentSearchQuery.toLowerCase()) ||
        book.tags.some(t => t.toLowerCase().includes(currentSearchQuery.toLowerCase()));

      const matchesTopic =
        currentTopic === "All" || book.tags.includes(currentTopic);

      const matchesAuthor =
        currentAuthor === "All" || book.author.toLowerCase().includes(currentAuthor.toLowerCase());

      const matchesRating =
        currentRating === "All" || book.rating >= parseFloat(currentRating);

      return matchesSearch && matchesTopic && matchesAuthor && matchesRating;
    })
    .sort((a, b) => {
      if (currentSort === "rating") return b.rating - a.rating;
      if (currentSort === "title") return a.title.localeCompare(b.title);
      return b.match - a.match;
    });
}

export function renderBooks() {
  const container = document.getElementById("booksFeedList");
  if (!container) return;

  const booksList = getFilteredBooks();

  if (booksList.length === 0) {
    container.innerHTML = `
      <div style="background:#fff; border-radius:24px; border:1px solid #e2e8f0; padding:40px; text-align:center;">
        <p style="font-size:16px; font-weight:700; color:#1e293b;">No matching books found</p>
        <p style="font-size:13px; color:#64748b; margin-top:6px;">Try clearing filters or searching another keyword.</p>
        <button onclick="window.resetFilters()" style="margin-top:14px; background:#2355cf; color:#fff; border:none; padding:8px 18px; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer;">Reset Filters</button>
      </div>
    `;
    return;
  }

  container.innerHTML = booksList.map(book => {
    const bookId = JSON.stringify(book.id);
    return `
    <article class="book-card ${book.id === selectedBookId ? 'highlighted-card' : ''}" onclick="window.selectBook(${bookId})">
      <div class="book-main-details">
        ${book.badge ? `<div class="book-badge-pill">★ ${book.badge}</div>` : ''}
        <h3 class="book-title">${book.title}</h3>
        <p class="book-author">by ${book.author}</p>
        <div class="book-tags-row">
          ${book.tags.map(t => `<span class="book-tag" onclick="event.stopPropagation(); window.filterByTag('${t}')">${t}</span>`).join('')}
        </div>
        <div class="book-rating-row">
          ★ ${book.rating} / 5 <span class="ratings-count">(${book.ratingsCount} reviews)</span>
        </div>
        <p class="book-desc">${book.desc}</p>
        <div class="book-actions-group">
          <button class="btn-alt-view" onclick="event.stopPropagation(); window.navigateToPage('alternate')">Alternate Books</button>
        </div>
      </div>
      <div class="match-score-badge" title="AI Recommendation Match">
        <div class="match-ring">${book.match}%</div>
      </div>
    </article>
  `;
  }).join('');

  refreshIcons();
}

export function renderBorrowingHistoryWidget() {
  const container = document.getElementById("borrowingHistoryList");
  if (!container) return;

  const recent = borrowingHistoryData.slice(0, 4);
  container.innerHTML = recent.map(item => `
    <div class="history-item" onclick="window.navigateToPage('history')" style="cursor:pointer;" title="Click to view full history page">
      <div class="history-meta">
        <span class="history-title">${item.title}</span>
        <span class="history-author">${item.author}</span>
      </div>
      <span class="history-status-badge ${item.statusType === 'active' ? 'active-status' : ''}">${item.statusType === 'active' ? 'Active' : 'Returned'}</span>
    </div>
  `).join('');
}

export function renderHistoryPageTable() {
  const table = document.getElementById("historyPageTable");
  if (!table) return;

  table.innerHTML = borrowingHistoryData.map(item => `
    <tr>
      <td>${item.title}</td>
      <td>${item.author}</td>
      <td>${item.issueDate}</td>
      <td>${item.dueDate}</td>
      <td>${item.status}</td>
    </tr>
  `).join('');
}

export function selectBook(id) {
  selectedBookId = id;
  const book = recommendedBooks.find(b => b.id === id);
  if (!book) return;

  const titleEl = document.getElementById("whyBookTitle");
  if (titleEl) {
    titleEl.textContent = book.title;
  }

  const percentEl = document.getElementById("meterPercent");
  const pathEl = document.getElementById("meterActivePath");
  if (percentEl && pathEl) {
    percentEl.textContent = `${book.match}%`;
    pathEl.setAttribute("stroke-dasharray", `${book.match}, 100`);
  }

  const reasons = document.getElementById("reasonsChecklist");
  if (reasons) {
    reasons.innerHTML = (book.whyReasons || []).map(reason => `
      <li class="checklist-interactive">
        <i data-lucide="external-link" class="check-blue"></i>
        <span><strong>${reason.label}</strong> — ${reason.detail}</span>
      </li>
    `).join('');
  }

  renderBooks();
  refreshIcons();
}

function updateHistoryRibbon() {
  const totalCount = borrowingHistoryData.length;
  const activeCount = borrowingHistoryData.filter(i => i.statusType === 'active').length;

  const totalEl = document.getElementById("pageRibbonTotalCount");
  const activeEl = document.getElementById("pageRibbonActiveCount");
  if (totalEl) totalEl.textContent = totalCount;
  if (activeEl) activeEl.textContent = activeCount;

  const profileTotal = document.getElementById("profileTotalBorrowed");
  if (profileTotal) profileTotal.textContent = totalCount;
}

// =========================================================================
// 8. DEDICATED BORROW BOOK UI & CHECKOUT (WORKS EVERYWHERE!)
// =========================================================================
let currentBorrowingBook = null;

export function openBorrowModal(bookId) {
  const book = recommendedBooks.find(b => b.id === bookId);
  if (!book) return;

  currentBorrowingBook = {
    title: book.title,
    author: book.author,
    category: book.tags[0] || "General",
    copies: book.copiesAvailable,
    shelfLocation: book.shelfLocation || "Rack B-2, Shelf 1",
    isbn: book.isbn,
    id: book.id
  };

  renderBorrowModalContent();
  const modal = document.getElementById("borrowModal");
  if (modal) modal.classList.add("open");
  refreshIcons();
}

export function openBorrowCustomModal(title, author, category, copies) {
  currentBorrowingBook = {
    title,
    author,
    category,
    copies: copies || 3,
    shelfLocation: "Rack C-1, Shelf 4",
    isbn: "978-0123984711",
    id: Date.now()
  };

  renderBorrowModalContent();
  closeBookModal();
  const modal = document.getElementById("borrowModal");
  if (modal) modal.classList.add("open");
  refreshIcons();
}

export function closeBorrowModal() {
  const modal = document.getElementById("borrowModal");
  if (modal) modal.classList.remove("open");
}

function calculateDueDate(days) {
  const today = new Date();
  today.setDate(today.getDate() + parseInt(days));
  return today.toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: 'numeric' });
}

export function updateDueDateDisplay(days) {
  const dueSpan = document.getElementById("borrowDueDisplay");
  if (dueSpan) {
    dueSpan.textContent = calculateDueDate(days);
  }
}

function renderBorrowModalContent() {
  const container = document.getElementById("borrowModalContent");
  if (!container || !currentBorrowingBook) return;

  const todayStr = new Date().toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: 'numeric' });
  const initialDueStr = calculateDueDate(14);

  container.innerHTML = `
    <!-- Book Summary Header -->
    <div class="borrow-book-summary-box">
      <div>
        <h4 class="borrow-book-title">${currentBorrowingBook.title}</h4>
        <p class="borrow-book-author">by ${currentBorrowingBook.author} • ${currentBorrowingBook.category}</p>
        <span style="font-size:11px; color:#64748b;">Location: <strong>${currentBorrowingBook.shelfLocation}</strong> | ISBN: ${currentBorrowingBook.isbn}</span>
      </div>
      <span class="borrow-availability-tag">✓ ${currentBorrowingBook.copies} Copies Available</span>
    </div>

    <!-- Student & Checkout Details Form -->
    <div class="borrow-form-group">
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Student Name</label>
          <input type="text" class="form-input" value="Rutuja Kamble" readonly>
        </div>
        <div class="form-field">
          <label class="form-label">Student ID / Card</label>
          <input type="text" class="form-input" value="STU-2024-89 (Active)" readonly>
        </div>
      </div>

      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Issue Date</label>
          <input type="text" class="form-input" value="${todayStr}" readonly>
        </div>
        <div class="form-field">
          <label class="form-label">Borrow Duration</label>
          <select id="borrowPeriodSelect" class="form-select" onchange="window.updateDueDateDisplay(this.value)">
            <option value="14" selected>14 Days (Standard Student Term)</option>
            <option value="7">7 Days (Short Term)</option>
            <option value="21">21 Days (Exam Prep / Extended)</option>
          </select>
        </div>
      </div>

      <div class="borrow-details-card">
        <div class="borrow-details-row">
          <span>Expected Return Due Date:</span>
          <strong id="borrowDueDisplay" style="color:#2355cf; font-size:13px;">${initialDueStr}</strong>
        </div>
        <div class="borrow-details-row">
          <span>Pickup Desk:</span>
          <span>Central Circulation Counter Desk #2</span>
        </div>
        <div class="borrow-details-row">
          <span>Overdue Fine Policy:</span>
          <span style="color:#16a34a; font-weight:600;">₹0 (Free return before due date)</span>
        </div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="borrow-actions-row">
      <button class="btn-borrow-cancel" onclick="window.closeBorrowModal()">Cancel</button>
      <button class="btn-borrow-confirm" onclick="window.confirmBorrow()">
        <i data-lucide="check-circle-2"></i>
        <span>Confirm & Issue Book</span>
      </button>
    </div>
  `;

  refreshIcons();
}

export function confirmBorrow() {
  if (!currentBorrowingBook) return;

  const daysSelect = document.getElementById("borrowPeriodSelect");
  const days = daysSelect ? daysSelect.value : 14;
  const dueDateStr = calculateDueDate(days);
  const todayStr = new Date().toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: 'numeric' });
  const token = "LIB-" + Math.floor(100000 + Math.random() * 900000);

  // Decrement copy in book catalog if present
  const book = recommendedBooks.find(b => b.id === currentBorrowingBook.id);
  if (book && book.copiesAvailable > 0) {
    book.copiesAvailable -= 1;
  }

  // Add to borrowing history
  borrowingHistoryData.unshift({
    id: token,
    title: currentBorrowingBook.title,
    author: currentBorrowingBook.author,
    category: currentBorrowingBook.category,
    issueDate: todayStr,
    dueDate: dueDateStr,
    returnDate: "Pending",
    status: `Active (Due: ${dueDateStr})`,
    statusType: "active"
  });

  // Re-render UI
  renderBooks();
  renderBorrowingHistoryWidget();
  updateHistoryRibbon();

  // Show Digital Receipt Slip in the modal
  const container = document.getElementById("borrowModalContent");
  if (container) {
    container.innerHTML = `
      <div class="borrow-receipt-slip">
        <div class="receipt-icon-circle">✓</div>
        <h3 class="receipt-title">Book Issued Successfully!</h3>
        <p class="receipt-desc">
          <strong>"${currentBorrowingBook.title}"</strong> has been checked out to <strong>Rutuja Kamble</strong>.
        </p>

        <div class="receipt-token-box">
          <span class="receipt-token-label">Digital Issue Verification Token</span>
          <span class="receipt-token-value">${token}</span>
        </div>

        <div class="borrow-details-card" style="width:100%; text-align:left;">
          <div class="borrow-details-row">
            <span>Issue Date:</span>
            <strong>${todayStr}</strong>
          </div>
          <div class="borrow-details-row">
            <span>Due Return Date:</span>
            <strong style="color:#2355cf;">${dueDateStr}</strong>
          </div>
          <div class="borrow-details-row">
            <span>Pickup Counter:</span>
            <strong>Desk #2 (Show token)</strong>
          </div>
        </div>

        <div style="display:flex; gap:12px; margin-top:12px;">
          <button class="btn-borrow-cancel" onclick="window.closeBorrowModal()">Close</button>
          <button class="btn-borrow" onclick="window.closeBorrowModal(); window.navigateToPage('history');" style="padding:10px 18px; font-size:13px;">
            View in Borrowing History ↗
          </button>
        </div>
      </div>
    `;
  }

  refreshIcons();
}

// Filter helpers for main recommendations
export function filterBooksBySearch(query) {
  currentSearchQuery = query.trim();
  renderBooks();
}

export function filterByAuthorClick(authorName) {
  openAuthorSpotlight(authorName);
}

export function filterByRatingClick() {
  navigateToPage('rating');
}

export function applyFilters() {
  const topicEl = document.getElementById("filterTopic");
  const authorEl = document.getElementById("filterAuthor");
  const ratingEl = document.getElementById("filterRating");

  if (topicEl) currentTopic = topicEl.value;
  if (authorEl) currentAuthor = authorEl.value;
  if (ratingEl) currentRating = ratingEl.value;

  renderBooks();
}

export function applySort(sortBy) {
  currentSort = sortBy;
  renderBooks();
}

export function filterByTag(tag) {
  const searchInput = document.getElementById("bookSearchInput");
  if (searchInput) searchInput.value = tag;
  currentSearchQuery = tag;
  renderBooks();
  showToast(`Filtered by tag: ${tag}`);
}

export function resetFilters() {
  currentSearchQuery = "";
  currentTopic = "All";
  currentAuthor = "All";
  currentRating = "All";
  currentSort = "relevance";

  const searchInput = document.getElementById("bookSearchInput");
  if (searchInput) searchInput.value = "";

  const topicEl = document.getElementById("filterTopic");
  const authorEl = document.getElementById("filterAuthor");
  const ratingEl = document.getElementById("filterRating");
  const sortEl = document.getElementById("sortBy");

  if (topicEl) topicEl.value = "All";
  if (authorEl) authorEl.value = "All";
  if (ratingEl) ratingEl.value = "All";
  if (sortEl) sortEl.value = "relevance";

  renderBooks();
  showToast("Filters reset to default");
}

export function openBookModal(id) {
  const book = recommendedBooks.find(b => b.id === id);
  if (!book) return;

  const modal = document.getElementById("bookModal");
  const titleEl = document.getElementById("modalBookTitle");
  const bodyEl = document.getElementById("modalBookBody");

  if (titleEl) titleEl.textContent = book.title;
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <p style="font-size:14px; color:#64748b;">Author: <strong style="color:#1e293b;">${book.author}</strong></p>
        <p style="font-size:13px; color:#475569;">${book.desc}</p>
        
        <div style="background:#f8fafc; border-radius:12px; padding:12px; border:1px solid #e2e8f0; display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px;">
          <div><strong>Published:</strong> ${book.publishedYear}</div>
          <div><strong>Pages:</strong> ${book.pages}</div>
          <div><strong>Rating:</strong> ★ ${book.rating} / 5</div>
          <div><strong>Copies Available:</strong> <span style="color:#16a34a; font-weight:700;">${book.copiesAvailable} copies</span></div>
          <div style="grid-column: span 2;"><strong>Location:</strong> ${book.shelfLocation || "Not assigned"}</div>
        </div>

        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${book.tags.map(t => `<span style="background:#eff4fe; color:#2355cf; font-size:11px; font-weight:600; padding:3px 8px; border-radius:6px;">${t}</span>`).join('')}
        </div>

        <div style="margin-top:14px; display:flex; justify-content:flex-end; gap:10px;">
          <button onclick="window.closeBookModal()" style="padding:8px 16px; border:1px solid #cbd5e1; background:#fff; border-radius:10px; font-size:12px; cursor:pointer;">Close</button>
          <button onclick="window.closeBookModal(); window.navigateToPage('alternate');" style="padding:8px 16px; background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer;">Alternate Books</button>
        </div>
      </div>
    `;
  }

  if (modal) modal.classList.add("open");
}

export function closeBookModal() {
  const modal = document.getElementById("bookModal");
  if (modal) modal.classList.remove("open");
}

export function showToast(message) {
  const toast = document.getElementById("toastNotification");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

// Bind all interactive methods to window
if (typeof window !== "undefined") {
  window.navigateToPage = navigateToPage;
  window.selectBook = selectBook;
  window.filterBooksBySearch = filterBooksBySearch;
  window.filterByAuthorClick = filterByAuthorClick;
  window.filterByRatingClick = filterByRatingClick;
  window.applyFilters = applyFilters;
  window.applySort = applySort;
  window.filterByTag = filterByTag;
  window.resetFilters = resetFilters;
  window.openBookModal = openBookModal;
  window.closeBookModal = closeBookModal;
  window.showToast = showToast;

  // Author Page
  window.openAuthorSpotlight = openAuthorSpotlight;
  window.switchAuthor = switchAuthor;
  window.renderAuthorView = renderAuthorView;

  // Alternate Books Page
  window.changeAlternateTargetBook = changeAlternateTargetBook;
  window.shuffleAlternatePage = shuffleAlternatePage;
  window.renderAlternatePageView = renderAlternatePageView;

  // Rating Page
  window.filterRatingCards = filterRatingCards;
  window.submitStudentReview = submitStudentReview;
  window.selectAlternateRating = selectAlternateRating;
  window.submitAlternateReview = submitAlternateReview;
  window.renderRatingPageView = renderRatingPageView;

  // Dedicated Borrow UI
  window.openBorrowModal = openBorrowModal;
  window.openBorrowCustomModal = openBorrowCustomModal;
  window.closeBorrowModal = closeBorrowModal;
  window.updateDueDateDisplay = updateDueDateDisplay;
  window.confirmBorrow = confirmBorrow;
  window.fetchRecommendations = fetchRecommendations;
}

export async function initApp() {
  bindReviewStars();
  await fetchRecommendations();
  refreshIcons();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
}
