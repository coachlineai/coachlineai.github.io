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
  initDeletion(user);
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

function initDeletion(user) {
  const dialog = document.querySelector('#account-deletion');
  const form = dialog.querySelector('form');
  const phrase = form.elements.phrase;
  const submit = form.querySelector('[type=submit]');
  const cancel = form.querySelector('[data-cancel]');
  const status = form.querySelector('[role=status]');
  const required = 'DELETE MY ACCOUNT';
  let busy = false;
  document.querySelector('#open-delete-account').onclick = () => {
    form.reset();
    submit.disabled = true;
    status.textContent = '';
    dialog.showModal();
    phrase.focus();
  };
  phrase.oninput = () => { submit.disabled = busy || phrase.value !== required; };
  cancel.onclick = () => dialog.close();
  dialog.oncancel = event => { if (busy) event.preventDefault(); };
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy || phrase.value !== required) return;
    busy = submit.disabled = cancel.disabled = phrase.disabled = true;
    status.textContent = 'Deleting your account…';
    try {
      // Storage's remove API deletes the file as well as its metadata.
      while (true) {
        const { data, error } = await db.rpc('delete_my_account', { confirmation: required });
        if (error) throw error;
        if (!data.length) break;
        for (const bucket of new Set(data.map(file => file.bucket))) {
          const paths = data.filter(file => file.bucket === bucket).map(file => file.path);
          const result = await db.storage.from(bucket).remove(paths);
          if (result.error || !result.data?.length) throw result.error || Error('Upload cleanup did not complete.');
        }
      }
      try { await clearLocalCoach(user.id); } finally {
        try { await db.auth.signOut({scope:'local'}); } finally { location.replace('signin.html'); }
      }
    } catch (error) {
      status.textContent = 'Deletion could not finish. ' + error.message + ' Sign in again or retry.';
    } finally {
      busy = cancel.disabled = phrase.disabled = false;
      phrase.oninput();
    }
  };
}

function clearLocalCoach(owner) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('coachline-coach-preview', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('settings')) { database.close(); resolve(); return; }
      const tx = database.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      store.delete(owner + '/draft');
      store.delete(owner + '/published');
      tx.oncomplete = () => { database.close(); resolve(); };
      tx.onabort = () => { database.close(); reject(tx.error); };
    };
  });
}
