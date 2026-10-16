// How a student device talks to the server. Two modes:
// - "server": the page came from server.js. The student joins with a class
//   code, and each answer is sent as an anonymous count.
// - "demo": opened as a plain file or from a static host. The game plays the
//   same way and sends nothing anywhere.
//
// Every request a student device makes is in this file. The only data sent is
// the class code, the case set id, and anonymous answers (which case, right or
// wrong, which three question letters, and the final score).
(function (root) {
  const CODE_KEY = 'ai-detective:class';
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const CODE_LENGTH = 6;

  let mode = 'demo';
  let joined = null; // { code, caseSetId }

  function cleanCode(raw) {
    let out = '';
    for (const ch of String(raw || '').toUpperCase()) {
      if (ALPHABET.includes(ch)) out += ch;
      if (out.length === CODE_LENGTH) break;
    }
    return out;
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
      // Storage blocked: the student just enters the code again next time.
    }
  }

  async function init() {
    if (root.document.getElementById('demo-data') || root.location.protocol === 'file:') return (mode = 'demo');
    try {
      const res = await fetch('api/health', { cache: 'no-store' });
      const body = res.ok ? await res.json() : null;
      mode = body && body.ok ? 'server' : 'demo';
    } catch (e) {
      mode = 'demo';
    }
    return mode;
  }

  // { caseSet, settings } or { error: 'missing' | 'expired' | 'slow-down' | 'network' }
  async function join(rawCode) {
    const code = cleanCode(rawCode);
    if (code.length !== CODE_LENGTH) return { error: 'missing' };
    let res;
    try {
      res = await fetch('api/join?code=' + encodeURIComponent(code), { cache: 'no-store' });
    } catch (e) {
      return { error: 'network' };
    }
    if (res.status === 404) return { error: 'missing' };
    if (res.status === 410) return { error: 'expired' };
    if (res.status === 429) return { error: 'slow-down' };
    if (!res.ok) return { error: 'network' };
    const body = await res.json();
    joined = { code, caseSetId: body.caseSet.id };
    writeLocal(CODE_KEY, code);
    return { caseSet: body.caseSet, settings: body.class };
  }

  // The demo's cases: embedded in the page, or the default set from cases/.
  async function demoCaseSet() {
    const inline = root.document.getElementById('demo-data');
    if (inline) return JSON.parse(inline.textContent);
    const index = await (await fetch('cases/sets.json')).json();
    const entry = index.sets.find((s) => s.id === index.default);
    return (await fetch('cases/' + entry.file)).json();
  }

  async function send(event) {
    if (mode !== 'server' || !joined) return;
    try {
      const res = await fetch('api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classCode: joined.code, caseSetId: joined.caseSetId, event }),
      });
      await res.text();
    } catch (e) {
      // Offline for a moment: this answer isn't counted, the game carries on.
    }
  }

  function leave() {
    joined = null;
    writeLocal(CODE_KEY, null);
  }

  root.AIDetectiveStore = {
    init,
    join,
    demoCaseSet,
    send,
    leave,
    cleanCode,
    CODE_LENGTH,
    savedCode: () => cleanCode(readLocal(CODE_KEY)),
    get mode() {
      return mode;
    },
  };
})(window);
