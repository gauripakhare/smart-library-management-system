// ---- bottom navigation ----
const tabs = document.querySelectorAll('.tab');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('is-active'));
    tab.classList.add('is-active');
    console.log('Tab opened:', tab.dataset.tab);
  });
});

// ---- check-out ----
const scanBtn  = document.getElementById('scanBtn');
const btnLabel = scanBtn.querySelector('span');
const toast    = document.getElementById('toast');
const logCount = document.getElementById('logCount');

scanBtn.addEventListener('click', () => {
  scanBtn.disabled = true;
  btnLabel.textContent = 'SCANNING…';

  setTimeout(() => {
    const time = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });

    toast.textContent = 'Checked out at ' + time;
    toast.hidden = false;

    btnLabel.textContent = 'CHECKED OUT';

    setTimeout(() => {
      scanBtn.disabled = false;
      btnLabel.textContent = 'SCAN QR & CHECK-OUT';
    }, 2500);
  }, 900);
});
