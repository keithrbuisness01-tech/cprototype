// Teacher sign-in page: shows why someone landed here and one button per
// school account provider that the server has set up.
(function () {
  const MESSAGES = {
    'not-approved': "That account isn't on the approved teacher list. If you're a teacher, ask the person who runs AI Detective to add you. Students don't need to sign in.",
    'sign-in-failed': "Sign-in didn't finish. Please try again.",
    idle: 'You were signed out because nothing happened for a few minutes.',
    'signed-out': 'You are signed out.',
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
    .then(({ providers }) => {
      const box = document.getElementById('buttons');
      if (!providers.length) document.getElementById('no-providers').hidden = false;
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
})();
