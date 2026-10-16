// The Options panel opened from the corner tab. Display options are the same
// for students and teachers; the teacher page adds its own section. Built
// from one definition so both pages match, and tested for "no free-text
// input" in test/options.test.js.
(function (root) {
  const THEMES = [
    { id: 'case-board', name: 'Case Board' },
    { id: 'pink-blue', name: 'Pink &amp; Blue' },
    { id: 'night-shift', name: 'Night Shift' },
    { id: 'calm', name: 'Calm' },
  ];
  const SIZES = [
    { id: 'standard', name: 'Standard', cls: 'ts-1' },
    { id: 'large', name: 'Large', cls: 'ts-2' },
    { id: 'xlarge', name: 'Extra large', cls: 'ts-3' },
  ];
  const SWITCHES = [
    { id: 'sound', name: 'Sound', note: 'Clicks, a chime and Fib\'s "wah-wah"' },
    { id: 'reducedMotion', name: 'Reduced motion', note: 'Stops wobbles, spins and stamps' },
    { id: 'highContrast', name: 'High contrast', note: 'Black and white, thicker outlines' },
  ];

  function displayOptionsHtml() {
    return (
      '<fieldset class="opt-group">' +
      '<legend>Text size</legend>' +
      '<div class="segmented">' +
      SIZES.map((s) => '<label><input type="radio" name="opt-textSize" value="' + s.id + '"><span><b class="ts ' + s.cls + '">Aa</b>' + s.name + '</span></label>').join('') +
      '</div></fieldset>' +
      '<div class="opt-switches">' +
      SWITCHES.map((s) =>
        '<div class="opt-switch"><label for="opt-' + s.id + '">' + s.name + ' <small>' + s.note + '</small></label>' +
        '<input type="checkbox" role="switch" id="opt-' + s.id + '" data-option="' + s.id + '"></div>').join('') +
      '<p class="opt-note" id="opt-sound-note" hidden>Your teacher has turned sound off for this class.</p>' +
      '</div>' +
      '<fieldset class="opt-group" id="opt-theme-group">' +
      '<legend>Color theme</legend>' +
      '<p class="opt-note" id="opt-theme-note" hidden>High contrast is on, so the color theme is paused.</p>' +
      '<div class="theme-grid">' +
      THEMES.map((t) => '<label><input type="radio" name="opt-theme" value="' + t.id + '"><span><i class="swatch swatch-' + t.id + '"></i>' + t.name + '</span></label>').join('') +
      '</div></fieldset>' +
      '<p class="opt-note">Display choices are saved on this device only.</p>'
    );
  }

  const api = { displayOptionsHtml, THEMES, SIZES, SWITCHES };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  // ---- Browser only ----------------------------------------------------------

  // mount({ extra, footer }) puts the tab and panel on the page. `extra` is an
  // optional element shown above the display options (the teacher section);
  // `footer` is an optional element shown at the bottom.
  function mount({ extra, footer } = {}) {
    const Options = root.AIDetectiveOptions;
    const Sound = root.AIDetectiveSound;
    let soundLocked = false;

    const tab = document.createElement('button');
    tab.className = 'options-tab';
    tab.id = 'options-tab';
    tab.type = 'button';
    tab.setAttribute('aria-expanded', 'false');
    tab.setAttribute('aria-controls', 'options-panel');
    tab.innerHTML = '<span class="options-tab-icon" aria-hidden="true"></span><span>Options</span>';

    const scrim = document.createElement('div');
    scrim.className = 'options-scrim';
    scrim.hidden = true;

    const panel = document.createElement('section');
    panel.className = 'options-panel';
    panel.id = 'options-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'options-title');
    panel.innerHTML =
      '<div class="options-head"><h2 id="options-title">Options</h2>' +
      '<button class="options-close" type="button" aria-label="Close options">&times;</button></div>' +
      '<div class="options-extra"></div>' +
      '<div class="options-display">' + displayOptionsHtml() + '</div>' +
      '<div class="options-foot"></div>';
    if (extra) panel.querySelector('.options-extra').appendChild(extra);
    else panel.querySelector('.options-extra').remove();
    if (footer) panel.querySelector('.options-foot').appendChild(footer);
    else panel.querySelector('.options-foot').remove();

    document.body.append(tab, scrim, panel);
    const q = (sel) => panel.querySelector(sel);

    function sync() {
      const o = Options.get();
      for (const input of panel.querySelectorAll('.options-display input[type="radio"]')) {
        input.checked = o[input.name.replace('opt-', '')] === input.value;
      }
      for (const input of panel.querySelectorAll('.options-display input[data-option]')) {
        input.checked = o[input.dataset.option];
      }
      q('#opt-sound').disabled = soundLocked;
      if (soundLocked) q('#opt-sound').checked = false;
      q('#opt-sound-note').hidden = !soundLocked;
      q('#opt-theme-group').disabled = o.highContrast;
      q('#opt-theme-note').hidden = !o.highContrast;
    }

    function open() {
      sync();
      panel.hidden = false;
      scrim.hidden = false;
      tab.setAttribute('aria-expanded', 'true');
      q('.options-close').focus();
    }

    function close(returnFocus) {
      if (panel.hidden) return;
      panel.hidden = true;
      scrim.hidden = true;
      tab.setAttribute('aria-expanded', 'false');
      if (returnFocus) tab.focus();
    }

    tab.addEventListener('click', open);
    q('.options-close').addEventListener('click', () => close(true));
    scrim.addEventListener('click', () => close(true));

    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        close(true);
        return;
      }
      if (e.key !== 'Tab') return;
      // Keep keyboard focus inside the open panel.
      const focusable = Array.from(panel.querySelectorAll('button, input, select, a[href]')).filter((n) => !n.disabled && n.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    panel.querySelector('.options-display').addEventListener('change', (e) => {
      const input = e.target;
      if (input.type === 'radio') {
        Options.set(input.name.replace('opt-', ''), input.value);
      } else if (input.dataset.option) {
        Options.set(input.dataset.option, input.checked);
        if (input.dataset.option === 'sound' && input.checked && Sound) Sound.play('right');
      }
      sync();
    });

    return {
      open,
      close,
      // The class's "mute sound" setting from the teacher.
      lockSound(locked) {
        soundLocked = Boolean(locked);
        sync();
      },
    };
  }

  root.AIDetectiveOptionsPanel = Object.assign(api, { mount });
})(typeof window !== 'undefined' ? window : globalThis);
