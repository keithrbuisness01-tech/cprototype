// Student options: text size, sound, reduced motion, high contrast, color theme.
// Saved in this browser only; nothing here talks to the server. Loaded in
// <head> so the saved look applies before the page first paints.
(function (root) {
  const STORAGE_KEY = 'ai-detective:options';

  const CHOICES = {
    textSize: ['standard', 'large', 'xlarge'],
    sound: [false, true],
    reducedMotion: [false, true],
    highContrast: [false, true],
    theme: ['case-board', 'pink-blue', 'night-shift', 'calm'],
  };

  function defaults(systemReducedMotion) {
    return {
      textSize: 'standard',
      sound: false,
      reducedMotion: Boolean(systemReducedMotion),
      highContrast: false,
      theme: 'case-board',
    };
  }

  // Keeps only known keys with allowed values; anything else falls back to the
  // default, so old or tampered saves can't break the page.
  function normalize(raw, systemReducedMotion) {
    const result = defaults(systemReducedMotion);
    if (!raw || typeof raw !== 'object') return result;
    for (const key of Object.keys(CHOICES)) {
      if (CHOICES[key].includes(raw[key])) result[key] = raw[key];
    }
    return result;
  }

  function parse(text, systemReducedMotion) {
    try {
      return normalize(JSON.parse(text), systemReducedMotion);
    } catch (e) {
      return defaults(systemReducedMotion);
    }
  }

  function serialize(options) {
    return JSON.stringify(normalize(options));
  }

  const api = { STORAGE_KEY, CHOICES, defaults, normalize, parse, serialize };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  // ---- Browser only ----------------------------------------------------------

  function systemReducedMotion() {
    try {
      return root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }

  function load() {
    let text = null;
    try {
      text = root.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      // Storage blocked: use defaults for this visit.
    }
    return text ? parse(text, systemReducedMotion()) : defaults(systemReducedMotion());
  }

  let current = load();

  function apply() {
    const el = root.document.documentElement;
    el.dataset.textSize = current.textSize;
    el.dataset.color = current.theme;
    el.dataset.motion = current.reducedMotion ? 'reduce' : 'full';
    el.dataset.contrast = current.highContrast ? 'high' : 'normal';
  }

  function set(key, value) {
    if (!(key in CHOICES) || !CHOICES[key].includes(value)) return false;
    current = Object.assign({}, current, { [key]: value });
    try {
      root.localStorage.setItem(STORAGE_KEY, serialize(current));
    } catch (e) {
      // Not saved, but still applied for this visit.
    }
    apply();
    return true;
  }

  apply();

  root.AIDetectiveOptions = Object.assign(api, {
    get: () => Object.assign({}, current),
    set,
  });
})(typeof window !== 'undefined' ? window : globalThis);
