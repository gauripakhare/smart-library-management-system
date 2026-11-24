document.addEventListener('DOMContentLoaded', async () => {
  const response = await fetch('sidebar.html');
  if (!response.ok) return;

  const template = document.createElement('template');
  template.innerHTML = await response.text();
  const sidebar = template.content.querySelector('.sidebar');
  const existingSidebar = document.querySelector('.sidebar');
  const placeholder = document.getElementById('sidebar-placeholder');

  if (placeholder) {
    placeholder.innerHTML = '';
    placeholder.appendChild(sidebar);
  } else if (existingSidebar) {
    existingSidebar.replaceWith(sidebar);
  } else {
    document.body.prepend(sidebar);
  }

  const logoutLink = sidebar.querySelector('#logout-btn, .logout-btn, .logout-item, [href*="logout"]');
  if (logoutLink && !logoutLink.dataset.logoutBound) {
    logoutLink.dataset.logoutBound = 'true';
    logoutLink.setAttribute('href', '../login.html');
    logoutLink.addEventListener('click', (event) => {
      event.preventDefault();
      if (!confirm('Are you sure you want to log out?')) return;
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_info');
      localStorage.removeItem('student_info');
      document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;';
      document.cookie = 'cetguru_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;';
      window.location.href = '../login.html';
    });
  }

  const currentPage = window.location.pathname.split('/').pop();
  sidebar.querySelectorAll('.nav-item[href]').forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === currentPage);
  });
});