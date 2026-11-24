document.addEventListener('DOMContentLoaded', async () => {
  const response = await fetch('admin-sidebar.html');
  if (!response.ok) return;

  const template = document.createElement('template');
  template.innerHTML = await response.text();
  const sidebar = template.content.querySelector('.sidebar');
  const existingSidebar = document.querySelector('.sidebar');
  const placeholder = document.getElementById('sidebar-placeholder');

  if (placeholder) {
    placeholder.replaceWith(sidebar);
  } else if (existingSidebar) {
    existingSidebar.replaceWith(sidebar);
  } else {
    const pageContent = document.createElement('div');
    pageContent.className = 'main-wrapper';
    while (document.body.firstChild) {
      pageContent.appendChild(document.body.firstChild);
    }
    document.body.append(sidebar, pageContent);
  }

  const logoutLink = sidebar.querySelector('#logout-btn, .logout-btn, .logout-item, [href*="logout"]');
  if (logoutLink && !logoutLink.dataset.logoutBound) {
    logoutLink.dataset.logoutBound = 'true';
    logoutLink.setAttribute('href', '../login.html');
    logoutLink.addEventListener('click', (event) => {
      event.preventDefault();
      if (!confirm('Are you sure you want to log out of the Admin Panel?')) return;
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_info');
      localStorage.removeItem('student_info');
      document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;';
      document.cookie = 'cetguru_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;';
      window.location.href = '../login.html';
    });
  }

  document.body.classList.add('portal-with-sidebar');

  const currentPage = window.location.pathname.split('/').pop();
  sidebar.querySelectorAll('.nav-item[href]').forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === currentPage);
  });
});