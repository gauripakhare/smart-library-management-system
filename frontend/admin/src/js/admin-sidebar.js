document.addEventListener('DOMContentLoaded', () => {
  initAdminNavigation();
});

function initAdminNavigation() {
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll('.nav-menu .nav-item');

  // Auto-highlight active route
  navLinks.forEach(link => {
    const linkPath = link.getAttribute('href');
    const pageAttr = link.getAttribute('data-page');

    if (currentPath.includes(linkPath) || (pageAttr && currentPath.includes(pageAttr))) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Logout action
  const logoutBtns = document.querySelectorAll('#logout-btn, .logout-btn, [href*="logout"]');
  logoutBtns.forEach(logoutBtn => {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('Are you sure you want to log out of the Admin Panel?')) {
        performAdminLogout();
      }
    });
  });
}

function performAdminLogout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('user_info');
  localStorage.removeItem('student_info');
  document.cookie = "access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;";
  document.cookie = "cetguru_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;";
  window.location.href = '../login.html';
}