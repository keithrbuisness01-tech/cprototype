// Teacher page: classes, the class report, the results summary, the lesson
// planner, and the teacher section of the Options panel. Every call goes to
// /api/teacher/*, which the server protects; this page is only served to a
// signed-in teacher on the approved list.
(function () {
  const { el, ask, copy } = window.AIDetectiveUI;
  const Report = window.AIDetectiveReport;
  const $ = (id) => document.getElementById(id);

  let me = null;
  let classes = [];
  let current = null;

  // ---- Server calls ------------------------------------------------------------

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
    lastPing = Date.now();
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      window.location.href = '/sign-in?error=' + encodeURIComponent(data.error || 'signed-out');
      throw new Error('signed out');
    }
    return { status: res.status, ok: res.ok, data };
  }

  async function signOut(reason) {
    try {
      await fetch('/auth/sign-out', { method: 'POST', credentials: 'same-origin' });
    } finally {
      window.location.href = '/sign-in?error=' + reason;
    }
  }

  // ---- Automatic sign-out after idle minutes ----------------------------------
  // The server enforces the same limit on every request; this just warns first.

  let lastActivity = Date.now();
  let lastPing = Date.now();
  function activity() {
    lastActivity = Date.now();
    $('idle-warning').hidden = true;
    // Keep the server session alive while someone is actually using the page.
    if (me && Date.now() - lastPing > 60000) api('/api/teacher/me').catch(() => {});
  }
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) document.addEventListener(type, activity, { passive: true });
  $('stay-signed-in').addEventListener('click', activity);
  setInterval(() => {
    if (!me) return;
    const idle = Date.now() - lastActivity;
    const limit = me.idleMinutes * 60000;
    if (idle >= limit) signOut('idle');
    else if (idle >= limit - 60000) $('idle-warning').hidden = false;
  }, 5000);

  // ---- Classes -----------------------------------------------------------------

  function caseSetName(id) {
    const set = me.caseSets.find((s) => s.id === id);
    return set ? 'Grade ' + set.grade + ' · ' + set.title : id;
  }

  function dateText(t) {
    return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function renderPicker() {
    const picker = $('class-picker');
    picker.innerHTML = '';
    for (const c of classes) {
      const opt = el('option', null, c.label);
      opt.value = c.id;
      picker.appendChild(opt);
    }
    picker.hidden = classes.length < 2;
    $('picker-label').hidden = classes.length < 2;
    if (current) picker.value = current.id;
    $('no-classes').hidden = classes.length > 0;
  }

  function renderClass() {
    const has = Boolean(current);
    $('class-card').hidden = !has;
    $('report-section').hidden = !has;
    $('planner').hidden = !has;
    renderTeacherSection();
    if (!has) return;
    $('teacher-title').textContent = current.label;
    $('class-name').textContent = current.label;
    $('class-meta').textContent = caseSetName(current.caseSetId) + (current.soundMuted ? ' · sound muted for the class' : '');
    $('big-code').textContent = current.code;
    $('big-code').classList.toggle('expired', !current.codeActive);
    $('code-status').textContent = current.codeActive
      ? 'Works until ' + dateText(current.codeExpiresAt)
      : 'Expired. Reset the code in Options to get a new one.';
    $('open-summary').href = '/teacher/summary/' + encodeURIComponent(current.id);
  }

  async function loadReport() {
    if (!current) return;
    $('report-body').innerHTML = '';
    $('report-body').appendChild(el('p', 'muted', 'Loading…'));
    const { ok, data } = await api('/api/teacher/classes/' + encodeURIComponent(current.id) + '/report');
    if (!ok) {
      $('report-body').innerHTML = '';
      $('report-body').appendChild(el('p', 'error', "Couldn't load the report. Try Refresh."));
      return;
    }
    const set = me.caseSets.find((s) => s.id === data.caseSet.id);
    Report.render($('report-body'), data.summary, set ? set.count : data.summary.perCase.length);
  }

  function select(id) {
    current = classes.find((c) => c.id === id) || classes[0] || null;
    renderPicker();
    renderClass();
    loadReport();
    $('planner-output').hidden = true;
    $('planner-status').textContent = '';
  }

  function replaceClass(updated) {
    classes = classes.map((c) => (c.id === updated.id ? updated : c));
    current = updated;
    renderPicker();
    renderClass();
  }

  async function loadClasses(selectId) {
    const { data } = await api('/api/teacher/classes');
    classes = data.classes || [];
    select(selectId || (current && current.id));
  }

  $('class-picker').addEventListener('change', (e) => select(e.target.value));

  $('new-class').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { ok, data } = await api('/api/teacher/classes', { method: 'POST', body: { label: $('new-label').value } });
    if (!ok) {
      await ask(data.error === 'too-many-classes' ? 'You can have up to 20 classes.' : "Couldn't add the class. Try again.", 'OK');
      return;
    }
    $('new-label').value = '';
    await loadClasses(data.class.id);
  });

  $('report-refresh').addEventListener('click', loadReport);

  $('copy-join').addEventListener('click', async () => {
    const done = await copy(current.joinUrl, $('big-code'));
    $('copy-note').textContent = done ? 'Join link copied.' : current.joinUrl;
  });

  // ---- Lesson planner ----------------------------------------------------------

  async function loadBudget() {
    const { data } = await api('/api/teacher/planner-budget');
    if (!data.enabled) {
      $('plan-btn').disabled = true;
      $('planner-budget').textContent = 'The lesson planner is not set up on this server.';
      return;
    }
    $('planner-budget').textContent = 'AI budget this month: $' + data.usedUsd.toFixed(2) + ' of $' + data.capUsd.toFixed(2) + ' used.';
  }

  $('plan-btn').addEventListener('click', async () => {
    $('plan-btn').disabled = true;
    $('planner-status').textContent = 'Writing a plan from your class totals. This can take up to a minute…';
    $('planner-output').hidden = true;
    try {
      const { ok, data } = await api('/api/teacher/classes/' + encodeURIComponent(current.id) + '/plan', { method: 'POST', body: {} });
      if (ok) {
        $('planner-output').textContent = data.plan;
        $('planner-output').hidden = false;
        $('planner-status').textContent = data.truncated ? 'The plan was cut short. Try again for a complete one.' : '';
      } else {
        $('planner-status').textContent = data.message || 'The planner is unavailable right now.';
      }
      if (data.budget) $('planner-budget').textContent = 'AI budget this month: $' + data.budget.usedUsd.toFixed(2) + ' of $' + data.budget.capUsd.toFixed(2) + ' used.';
    } finally {
      $('plan-btn').disabled = !me.plannerEnabled;
    }
  });

  // ---- Teacher section of the Options panel -----------------------------------

  const section = el('section', 'opt-teacher');
  section.setAttribute('aria-label', 'Teacher options');

  function button(label, onClick, cls) {
    const b = el('button', 'btn small ' + (cls || 'ghost'), label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  async function classAction(path, body, confirmText, confirmLabel) {
    if (confirmText && !(await ask(confirmText, confirmLabel))) return null;
    const { ok, data } = await api('/api/teacher/classes/' + encodeURIComponent(current.id) + path, { method: 'POST', body: body || {} });
    if (!ok) {
      await ask("That didn't work. Try again.", 'OK');
      return null;
    }
    replaceClass(data.class);
    return data.class;
  }

  function renderTeacherSection() {
    section.innerHTML = '';
    const note = el('p', 'opt-note opt-copy-note');
    note.setAttribute('aria-live', 'polite');

    if (current) {
      // Class code
      const codeGroup = el('div', 'opt-group');
      codeGroup.append(el('p', 'opt-legend', 'Class code'));
      const codeLine = el('p', 'opt-code');
      codeLine.append(el('strong', current.codeActive ? null : 'expired', current.code), ' ',
        el('span', 'opt-note', current.codeActive ? 'works until ' + dateText(current.codeExpiresAt) : 'expired'));
      codeGroup.append(codeLine);
      const codeBtns = el('div', 'opt-btns');
      codeBtns.append(
        button('Reset code', () => classAction('/reset-code', null,
          'Make a new code for ' + current.label + '? The old code stops working right away. Totals are kept.', 'Reset code')),
      );
      codeGroup.append(codeBtns);
      const expireRow = el('div', 'opt-row');
      const expireId = 'opt-expire';
      const expireLabel = el('label', null, 'Expire the code');
      expireLabel.htmlFor = expireId;
      const expire = el('select');
      expire.id = expireId;
      // "Now" is last and never the default, so one stray click can't lock a class out.
      for (const [value, text] of [['7', 'In 7 days'], ['30', 'In 30 days'], ['90', 'In 90 days'], ['0', 'Now']]) {
        const o = el('option', null, text);
        o.value = value;
        expire.appendChild(o);
      }
      expire.value = '30';
      expireRow.append(expireLabel, expire, button('Apply', () => {
        const days = Number(expire.value);
        classAction('/expire-code', { days }, days === 0 ? 'Stop this code working now? Students will need a new code.' : null, 'Expire now');
      }));
      codeGroup.append(expireRow);

      // Grade level and case set
      const setRow = el('div', 'opt-group');
      const setLabel = el('label', 'opt-legend', 'Grade level and case set');
      setLabel.htmlFor = 'opt-caseset';
      const setSelect = el('select');
      setSelect.id = 'opt-caseset';
      for (const s of me.caseSets) {
        const o = el('option', null, 'Grade ' + s.grade + ' · ' + s.title + ' (' + s.count + ' cases)');
        o.value = s.id;
        setSelect.appendChild(o);
      }
      setSelect.value = current.caseSetId;
      setSelect.addEventListener('change', async () => {
        const updated = await classAction('/settings', { caseSetId: setSelect.value },
          'Switch this class to ' + caseSetName(setSelect.value) + '? Students who are mid-game will need to rejoin.', 'Switch');
        if (updated) loadReport();
        else setSelect.value = current.caseSetId;
      });
      setRow.append(setLabel, setSelect);

      // Mute sound for the class
      const mute = el('div', 'opt-switch');
      const muteLabel = el('label', null, 'Mute sound for class ');
      muteLabel.htmlFor = 'opt-class-mute';
      muteLabel.append(el('small', null, 'Turns sound off on every student device, whatever they chose'));
      const muteInput = el('input');
      muteInput.type = 'checkbox';
      muteInput.setAttribute('role', 'switch');
      muteInput.id = 'opt-class-mute';
      muteInput.checked = current.soundMuted;
      muteInput.addEventListener('change', () => classAction('/settings', { soundMuted: muteInput.checked }));
      mute.append(muteLabel, muteInput);

      // Share
      const share = el('div', 'opt-group');
      share.append(el('p', 'opt-legend', 'Share'));
      const shareBtns = el('div', 'opt-btns');
      shareBtns.append(button('Copy join link', async () => {
        note.textContent = (await copy(current.joinUrl)) ? 'Join link copied.' : current.joinUrl;
      }));
      if (current.share) {
        shareBtns.append(
          button('Copy results link', async () => {
            note.textContent = (await copy(current.share.url)) ? 'Results link copied. It works until ' + dateText(current.share.expiresAt) + '.' : current.share.url;
          }),
          button('Turn off results link', () => classAction('/unshare', null,
            'Turn off the results link? Anyone you sent it to will no longer be able to open it.', 'Turn off'), 'ghost danger')
        );
      } else {
        shareBtns.append(button('Create results link', async () => {
          const updated = await classAction('/share', null,
            'Create a read-only link to the one-page results summary? It shows anonymous class totals only and stops working after 30 days.', 'Create link');
          if (updated && updated.share) note.textContent = (await copy(updated.share.url)) ? 'Results link created and copied.' : updated.share.url;
        }));
      }
      share.append(shareBtns, note);

      section.append(el('h3', 'opt-h', current.label), codeGroup, setRow, mute, share);
    } else {
      section.append(el('p', 'opt-note', 'Add a class to manage its code and sharing here.'));
    }

    // Account
    const account = el('div', 'opt-group opt-account');
    account.append(el('p', 'opt-legend', 'Account'), el('p', null, 'Signed in as ' + (me ? me.email : '…')));
    const accountBtns = el('div', 'opt-btns');
    if (me && me.supportUrl) {
      const support = el('a', 'btn small ghost', 'Get help');
      support.href = me.supportUrl;
      support.target = '_blank';
      support.rel = 'noopener noreferrer';
      accountBtns.append(support);
    }
    accountBtns.append(button('Sign out', () => signOut('signed-out'), 'primary'));
    account.append(accountBtns);
    section.append(account);
  }

  // ---- Boot --------------------------------------------------------------------

  async function boot() {
    const res = await api('/api/teacher/me');
    me = res.data;
    window.AIDetectiveOptionsPanel.mount({ extra: section });
    renderTeacherSection();
    await loadClasses();
    await loadBudget();
    $('plan-btn').disabled = !me.plannerEnabled;
  }

  boot().catch(() => {});
})();
