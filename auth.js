(() => {
  'use strict';
  const form = document.querySelector('.auth-form');
  function openDemo() {
    window.location.assign('dashboard.html');
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (form.reportValidity()) openDemo();
  });
  document.querySelector('[data-provider="Google"]').addEventListener('click', openDemo);
  const dialog = document.querySelector('.auth-dialog');
  const close = document.querySelector('.auth-dialog-close');
  const legalCopy = {
    privacy: ['Privacy Policy', 'Both sign-in options open a demo. CoachLine does not send your email or connect to your Google account. We have not added analytics or advertising trackers. GitHub Pages hosts the site and may process technical request information under its own privacy statement.'],
    terms: ['Preview terms', 'CoachLine is in development. These pages show the planned creator account experience. Signing in opens your creator dashboard. Subscriptions and payments are in development. The homepage conversations are scripted examples. Features and proposed pricing may change before launch.']
  };
  document.querySelectorAll('[data-legal]').forEach(button => {
    button.addEventListener('click', () => {
      const [title, text] = legalCopy[button.dataset.legal];
      dialog.querySelector('h2').textContent = title;
      dialog.querySelector('p').textContent = text;
      dialog.showModal();
      close.focus();
    });
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  });
})();
