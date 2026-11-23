import { db } from './supabase-client.js';

export function showSettingsTab(tab) {
  const selected = ['integrations', 'payments'].includes(tab) ? tab : 'profile';
  document.querySelectorAll('[data-settings]').forEach(panel => {
    panel.hidden = panel.dataset.settings !== selected;
  });
  document.querySelectorAll('.settings-tabs a').forEach(link => {
    if (link.hash === '#settings/' + selected) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

export function initSettings(user, profile) {
  const nameForm = document.querySelector('#settings-name');
  const emailForm = document.querySelector('#settings-email');
  const passwordForm = document.querySelector('#settings-password');
  nameForm.elements.fullName.value = profile.full_name;
  emailForm.elements.email.value = user.email;

  function onSave(form, save) {
    form.onsubmit = async event => {
      event.preventDefault();
      const button = form.querySelector('button');
      if (button.disabled) return;
      const status = form.querySelector('output');
      button.disabled = true;
      status.textContent = 'Saving…';
      try {
        status.textContent = await save(form.elements);
      } catch (error) {
        status.textContent = error.message || 'Could not save. Please try again.';
      } finally {
        button.disabled = false;
      }
    };
  }

  onSave(nameForm, async fields => {
    const name = fields.fullName.value.trim();
    if (!name) throw new Error('Enter your full name.');
    const { data, error } = await db.from('profiles').update({ full_name: name })
      .eq('id', user.id).select('full_name').single();
    if (error) throw error;
    profile.full_name = data.full_name;
    document.querySelector('#home-view h1').textContent = 'Welcome back, ' + data.full_name;
    return 'Name saved.';
  });

  onSave(emailForm, async fields => {
    const email = fields.email.value.trim();
    if (email === user.email) return 'This is already your sign-in email.';
    const { data, error } = await db.auth.updateUser({ email });
    if (error) throw error;
    user.email = data.user.email;
    return user.email === email ? 'Email updated.' : 'Check your inbox for the confirmation link to finish changing your email.';
  });

  onSave(passwordForm, async fields => {
    const password = fields.next.value;
    if (password !== fields.confirm.value) throw new Error('The new passwords must match.');
    const { error: verifyError } = await db.auth.signInWithPassword({
      email: user.email, password: fields.current.value
    });
    if (verifyError) throw verifyError;
    const { error } = await db.auth.updateUser({ password });
    if (error) throw error;
    passwordForm.reset();
    return 'Password updated.';
  });
}
