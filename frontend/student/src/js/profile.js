/**
 * Smart Library Management System - Student Profile Controller
 */

document.addEventListener("DOMContentLoaded", async () => {
  await loadStudentProfile();
});

async function loadStudentProfile() {
  const apiBase = typeof getApiBase === 'function' ? getApiBase() : (window.location.port === '8000' ? '' : 'http://127.0.0.1:8000');
  const token = localStorage.getItem('access_token');

  let profileData = null;

  // Try fetching profile from API /api/auth/me
  try {
    const res = await fetch(`${apiBase}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (res.ok) {
      profileData = await res.json();
    }
  } catch (err) {
    console.warn('Backend profile fetch error, falling back to local user_info:', err);
  }

  // Fallback to localStorage user_info if API call fails
  if (!profileData) {
    try {
      const stored = localStorage.getItem('user_info');
      if (stored) profileData = JSON.parse(stored);
    } catch (e) {}
  }

  if (!profileData) return;

  // Update Summary Card (Left Column)
  const nameEls = document.querySelectorAll('.student-name, .user-name');
  nameEls.forEach(el => el.textContent = profileData.name || 'Student');

  const idBadge = document.querySelector('.stu-id-badge');
  if (idBadge) idBadge.textContent = profileData.rollNumber || profileData.libraryCardNumber || 'STU001';

  // Helper to set field value by label text
  function setFieldByLabel(labelSearchText, valueText) {
    if (!valueText || valueText === 'null' || valueText === 'undefined') valueText = '-';
    
    // Meta items in left column
    document.querySelectorAll('.meta-item').forEach(item => {
      const label = item.querySelector('.meta-label');
      if (label && label.textContent.trim().toLowerCase() === labelSearchText.toLowerCase()) {
        const valSpan = item.querySelector('.meta-value');
        if (valSpan) valSpan.textContent = valueText;
      }
    });

    // Field groups in right column cards
    document.querySelectorAll('.field-group').forEach(group => {
      const label = group.querySelector('.field-label');
      if (label && label.textContent.trim().toLowerCase() === labelSearchText.toLowerCase()) {
        const valSpan = group.querySelector('.field-value');
        if (valSpan) valSpan.textContent = valueText;
      }
    });
  }

  // Populate Fields
  setFieldByLabel('Full Name', profileData.name);
  setFieldByLabel('Email ID', profileData.email);
  setFieldByLabel('Phone Number', profileData.contactNumber || profileData.contact);
  setFieldByLabel('Date of Birth', profileData.dob);
  setFieldByLabel('Gender', profileData.gender);

  setFieldByLabel('Class', profileData.class || profileData.className);
  setFieldByLabel('Batch', profileData.academicYear);
  setFieldByLabel('Department', profileData.department);
  setFieldByLabel('College', profileData.college);

  setFieldByLabel('Roll Number', profileData.rollNumber);
  setFieldByLabel('Library Card Number', profileData.libraryCardNumber || profileData.libraryNumber);
  setFieldByLabel('Role', (profileData.role || 'Student').toUpperCase());
  setFieldByLabel('Account Created', profileData.createdAt || '-');
}
