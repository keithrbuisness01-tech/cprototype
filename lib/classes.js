// Classes and their join codes. A code only opens the game for its class;
// it never grants anything on the teacher side.
const crypto = require('crypto');

// No 0/O, 1/I/L: easy to read off a board and type.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const DAY = 24 * 60 * 60 * 1000;

function randomCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return code;
}

function normalizeCode(raw) {
  const clean = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== CODE_LENGTH) return null;
  for (const ch of clean) if (!ALPHABET.includes(ch)) return null;
  return clean;
}

function cleanLabel(raw) {
  return String(raw || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
}

function classService(store, config, caseSets, now = () => Date.now()) {
  const all = () => store.classes.data;

  function uniqueCode() {
    const used = new Set(Object.values(all()).map((c) => c.code));
    let code;
    do code = randomCode(); while (used.has(code));
    return code;
  }

  function create(ownerEmail, { label } = {}) {
    const id = crypto.randomBytes(9).toString('base64url');
    const cls = {
      id,
      ownerEmail,
      label: cleanLabel(label) || 'My class',
      caseSetId: caseSets.defaultId,
      soundMuted: false,
      code: uniqueCode(),
      codeExpiresAt: now() + config.classCodeDays * DAY,
      share: null,
      createdAt: now(),
    };
    all()[id] = cls;
    store.classes.save();
    return cls;
  }

  function ownedBy(ownerEmail, id) {
    const cls = all()[id];
    return cls && cls.ownerEmail === ownerEmail ? cls : null;
  }

  function listFor(ownerEmail) {
    return Object.values(all()).filter((c) => c.ownerEmail === ownerEmail).sort((a, b) => a.createdAt - b.createdAt);
  }

  // 'ok' | 'expired' | 'missing'
  function lookupCode(raw) {
    const code = normalizeCode(raw);
    if (!code) return { status: 'missing' };
    const cls = Object.values(all()).find((c) => c.code === code);
    if (!cls) return { status: 'missing' };
    if (cls.codeExpiresAt <= now()) return { status: 'expired' };
    return { status: 'ok', cls };
  }

  function resetCode(cls) {
    cls.code = uniqueCode();
    cls.codeExpiresAt = now() + config.classCodeDays * DAY;
    store.classes.save();
  }

  function expireCode(cls, days) {
    cls.codeExpiresAt = now() + days * DAY;
    store.classes.save();
  }

  function update(cls, changes) {
    if (changes.caseSetId !== undefined) {
      if (!caseSets.get(changes.caseSetId)) return false;
      cls.caseSetId = changes.caseSetId;
    }
    if (changes.soundMuted !== undefined) {
      if (typeof changes.soundMuted !== 'boolean') return false;
      cls.soundMuted = changes.soundMuted;
    }
    if (changes.label !== undefined) cls.label = cleanLabel(changes.label) || cls.label;
    store.classes.save();
    return true;
  }

  function share(cls) {
    if (!cls.share || cls.share.expiresAt <= now()) {
      cls.share = { token: crypto.randomBytes(24).toString('base64url'), expiresAt: now() + config.shareDays * DAY };
      store.classes.save();
    }
    return cls.share;
  }

  function revokeShare(cls) {
    cls.share = null;
    store.classes.save();
  }

  function byShareToken(token) {
    if (typeof token !== 'string' || token.length < 20) return null;
    const cls = Object.values(all()).find((c) => c.share && c.share.token === token);
    return cls && cls.share.expiresAt > now() ? cls : null;
  }

  return { create, ownedBy, listFor, lookupCode, resetCode, expireCode, update, share, revokeShare, byShareToken };
}

module.exports = { classService, normalizeCode, ALPHABET, CODE_LENGTH };
