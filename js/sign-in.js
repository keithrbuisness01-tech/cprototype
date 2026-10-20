// Teacher sign-in page: shows why someone landed here and one button per
// school account provider that the server has set up.
(function () {
  const MESSAGES = {
    'not-approved': "That account isn't on the approved teacher list. If you're a teacher, ask the person who runs AI Detective to add you. Students don't need to sign in.",
    'sign-in-failed': "Sign-in didn't finish. Please try again.",
    idle: 'You were signed out because nothing happened for a few minutes.',
    'signed-out': 'You are signed out.',
  };
  const CODE_ERRORS = {
    'wrong-code': "That code isn't right. Check it and try again.",
    'slow-down': 'Too many tries. Wait 15 minutes, then try again.',
    'code-off': "The teacher code isn't turned on for this server.",
  };
  const error = new URLSearchParams(window.location.search).get('error');
  const message = document.getElementById('message');
  if (MESSAGES[error]) {
    message.textContent = MESSAGES[error];
    message.hidden = false;
    message.classList.toggle('bad', error === 'not-approved' || error === 'sign-in-failed');
  }

  fetch('/auth/providers', { cache: 'no-store' })
    .then((res) => res.json())
    .then((data) => {
      const providers = data.providers;
      const box = document.getElementById('buttons');
      if (!providers.length) document.getElementById('no-providers').hidden = false;
      document.getElementById('code-form').hidden = !data.teacherCode;
      if (!providers.length && data.teacherCode) document.getElementById('no-providers').hidden = true;
      for (const p of providers) {
        const a = document.createElement('a');
        a.className = 'btn primary big sign-in-btn';
        a.href = '/auth/' + encodeURIComponent(p.name);
        a.textContent = 'Sign in with ' + p.label;
        box.appendChild(a);
      }
    })
    .catch(() => {
      document.getElementById('no-providers').hidden = false;
    });

  // The teacher code is checked by the server, never in the browser.
  document.getElementById('code-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = document.getElementById('code-error');
    error.hidden = true;
    const res = await fetch('/auth/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: document.getElementById('teacher-code').value }),
      credentials: 'same-origin',
    }).catch(() => null);
    if (res && res.ok) {
      window.location.href = '/teacher';
      return;
    }
    const body = res ? await res.json().catch(() => ({})) : {};
    error.textContent = CODE_ERRORS[body.error] || "Couldn't sign in. Try again.";
    error.hidden = false;
    document.getElementById('teacher-code').select();
  });
})();
