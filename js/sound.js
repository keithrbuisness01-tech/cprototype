// Three short sound effects made in the browser, with no audio files.
// They play only when the student has turned sound on in Options.
(function (root) {
  let ctx = null;

  function context() {
    if (!ctx) {
      const AudioCtx = root.AudioContext || root.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(c, freq, start, duration, type, volume, endFreq) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  const SOUNDS = {
    // A soft tick when a clue opens.
    clue: (c, t) => tone(c, 1046, t, 0.07, 'triangle', 0.05),
    // A bright two-note chime when the player is right.
    right: (c, t) => {
      tone(c, 784, t, 0.14, 'triangle', 0.08);
      tone(c, 1175, t + 0.1, 0.24, 'triangle', 0.08);
    },
    // Fib's "wah-wah" when the player is fooled.
    wrong: (c, t) => {
      tone(c, 392, t, 0.22, 'sawtooth', 0.035, 370);
      tone(c, 330, t + 0.24, 0.42, 'sawtooth', 0.035, 262);
    },
  };

  function play(name) {
    if (!root.AIDetectiveOptions.get().sound || !SOUNDS[name]) return;
    try {
      const c = context();
      if (c) SOUNDS[name](c, c.currentTime + 0.01);
    } catch (e) {
      // Audio unavailable: the game carries on silently.
    }
  }

  root.AIDetectiveSound = { play };
})(window);
