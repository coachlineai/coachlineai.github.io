(() => {
  'use strict';
  const form = document.querySelector('.auth-form');
  const status = document.querySelector('.auth-status');
  const isSignup = document.body.dataset.authMode === 'signup';
  function showUnavailable(provider) {
    status.textContent = provider
      ? `${provider} access is coming soon. This preview hasn’t connected to your ${provider} account.`
      : `${isSignup ? 'Sign-up' : 'Sign-in'} is coming soon. No ${isSignup ? 'account was created and no ' : ''}email was sent. Your email address stays in this tab.`;
    status.hidden = false;
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    showUnavailable();
  });
  document.querySelectorAll('[data-provider]').forEach(button => {
    button.addEventListener('click', () => showUnavailable(button.dataset.provider));
  });
  const dialog = document.querySelector('.auth-dialog');
  const close = document.querySelector('.auth-dialog-close');
  const legalCopy = {
    privacy: ['Privacy Policy', 'This CoachLine preview does not create accounts, send sign-in emails, or connect to social accounts. Information entered on this page stays in this browser tab and is not sent to a server or saved by CoachLine. We have not added analytics or advertising trackers. GitHub Pages hosts the site and may process technical request information under its own privacy statement.'],
    terms: ['Preview terms', 'CoachLine is in development. These pages show the planned creator account experience. No account, subscription, or payment is created here. The homepage conversations are scripted examples. Features and proposed pricing may change before launch.']
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
