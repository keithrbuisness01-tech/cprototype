// Where the anonymous class totals live.
// - "shared": the page is served by server.js, so every device using the same
//   class code adds to one set of totals.
// - "local": the page was opened as a plain file or from a static host, so
//   totals stay in this browser only.
(function (root) {
  const Game = root.AIDetectiveGame;
  const DEFAULT_CLASS = 'MY-CLASS';
  const LOCAL_PREFIX = 'ai-detective:totals:';
  const CLASS_KEY = 'ai-detective:class';

  let mode = 'local';
  let caseCount = 0;

  function normalizeClassCode(code) {
    const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);
    return clean || DEFAULT_CLASS;
  }

  function readLocal(key) {
    try {
      return root.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function writeLocal(key, value) {
    try {
      if (value === null) root.localStorage.removeItem(key);
      else root.localStorage.setItem(key, value);
    } catch (e) {
      // Private windows and blocked storage: the game still plays, it just
      // won't remember totals.
    }
  }

  function localTotals(classCode) {
    const raw = readLocal(LOCAL_PREFIX + classCode);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.cases) && parsed.cases.length === caseCount) return parsed;
      } catch (e) {
        // fall through to a fresh set
      }
    }
    return Game.emptyTotals(caseCount);
  }

  async function init(count) {
    caseCount = count;
    if (root.location.protocol === 'file:') return mode;
    try {
      const res = await fetch('api/health', { cache: 'no-store' });
      const body = res.ok ? await res.json() : null;
      if (body && body.ok) mode = 'shared';
    } catch (e) {
      mode = 'local';
    }
    return mode;
  }

  async function send(classCode, event) {
    if (mode === 'shared') {
      try {
        const res = await fetch('api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classCode, event }),
        });
        if (res.ok) return;
      } catch (e) {
        // Server went away mid-game: keep the count on this device instead.
      }
    }
    const totals = localTotals(classCode);
    if (Game.applyEvent(totals, event)) writeLocal(LOCAL_PREFIX + classCode, JSON.stringify(totals));
  }

  async function getTotals(classCode) {
    if (mode === 'shared') {
      const res = await fetch('api/totals?class=' + encodeURIComponent(classCode), { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load class totals (' + res.status + ')');
      return res.json();
    }
    return localTotals(classCode);
  }

  function resetLocal(classCode) {
    writeLocal(LOCAL_PREFIX + classCode, null);
  }

  function savedClassCode() {
    return normalizeClassCode(readLocal(CLASS_KEY));
  }

  function saveClassCode(code) {
    writeLocal(CLASS_KEY, normalizeClassCode(code));
  }

  root.AIDetectiveStore = {
    init,
    send,
    getTotals,
    resetLocal,
    savedClassCode,
    saveClassCode,
    normalizeClassCode,
    get mode() {
      return mode;
    },
  };
})(window);
