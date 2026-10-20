// Fib, the prankster rival, in five poses. Each pose is a slot: until the
// illustrator's file is listed in assets/fib/poses.json, a hand-coded
// placeholder drawing is shown. Do not use AI-generated art for Fib.
(function (root) {
  const POSES = ['scheming', 'smug', 'caught', 'sulking', 'impressed'];
  const ALT = {
    scheming: 'Fib, scheming',
    smug: 'Fib, looking smug',
    caught: 'Fib, caught out',
    sulking: 'Fib, sulking',
    impressed: 'Fib, impressed',
  };

  // Placeholder face parts per pose. Eyelids are [outer, inner]: how far the
  // lid comes down at each corner, as a share of the eye's height (0 = wide
  // open). Gaze moves the pupils.
  const FACE = {
    scheming: {
      brows: '<path d="M37 55 Q45 56 54 62" /><path d="M66 62 Q75 56 83 55" />',
      lids: [0.3, 0.55], gaze: [3, 1], pupil: 3.4,
      mouth: 'M43 96 Q58 107 77 92', filled: false,
    },
    smug: {
      brows: '<path d="M37 61 Q45 59 53 61" /><path d="M67 58 Q74 52 83 53" />',
      lids: [0.5, 0.5], gaze: [2.5, 1.5], pupil: 3.4,
      mouth: 'M47 97 Q63 104 77 92', filled: false,
    },
    caught: {
      brows: '<path d="M38 57 Q45 51 53 53" /><path d="M67 53 Q75 51 82 57" />',
      lids: [0, 0], gaze: [0, 0], pupil: 2.4,
      mouth: 'M49 100 L54 95 L60 100 L66 95 L71 100', filled: false,
    },
    sulking: {
      brows: '<path d="M38 56 Q46 51 53 51" /><path d="M67 51 Q74 51 82 56" />',
      lids: [0.6, 0.35], gaze: [-1.5, 2.5], pupil: 3.2,
      mouth: 'M48 103 Q60 95 72 103', filled: false,
    },
    impressed: {
      brows: '<path d="M37 56 Q44 50 53 52" /><path d="M67 52 Q76 50 83 56" />',
      lids: [0, 0], gaze: [0, -1], pupil: 4.2, sparkle: true,
      mouth: 'M52 96 Q60 90 68 96 Q60 107 52 96 Z', filled: true,
    },
  };

  const EYE = { y: 74, rx: 9, ry: 7.5 };
  const n = (v) => Math.round(v * 100) / 100;

  // One eye: white, pupil with a glint, then the lid over the top. `side` is
  // -1 for Fib's left eye (on the viewer's left), 1 for the right.
  function eye(cx, side, f) {
    const { y: cy, rx, ry } = EYE;
    const [gx, gy] = f.gaze;
    const px = cx + gx;
    const py = cy + gy;
    let out =
      '<ellipse class="fib-eye" cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" />' +
      '<circle class="fib-pupil" cx="' + n(px) + '" cy="' + n(py) + '" r="' + f.pupil + '" />' +
      '<circle class="fib-glint" cx="' + n(px + f.pupil * 0.35) + '" cy="' + n(py - f.pupil * 0.4) + '" r="' + n(f.pupil * 0.32) + '" />';
    if (f.sparkle) out += '<circle class="fib-glint" cx="' + n(px - f.pupil * 0.45) + '" cy="' + n(py + f.pupil * 0.35) + '" r="' + n(f.pupil * 0.16) + '" />';
    const [outer, inner] = f.lids;
    if (outer || inner) {
      // The lid's edge is a straight line from the outer to the inner corner
      // depth; find where it meets the eye's outline.
      const top = cy - ry;
      const xl = cx - rx;
      const xr = cx + rx;
      const yl = top + 2 * ry * (side < 0 ? outer : inner);
      const yr = top + 2 * ry * (side < 0 ? inner : outer);
      const slope = (yr - yl) / (xr - xl);
      const c = yl - cy - slope * (xl - cx); // the line is y - cy = slope * u + c, with u = x - cx
      const a = 1 / (rx * rx) + (slope * slope) / (ry * ry);
      const b = (2 * slope * c) / (ry * ry);
      const k = (c * c) / (ry * ry) - 1;
      const root = Math.sqrt(Math.max(0, b * b - 4 * a * k));
      const u1 = (-b - root) / (2 * a);
      const u2 = (-b + root) / (2 * a);
      const p1 = [cx + u1, cy + slope * u1 + c];
      const p2 = [cx + u2, cy + slope * u2 + c];
      // Over the top of the eye from p1 to p2; the long way round if the lid
      // edge passes below the middle of the eye.
      const large = c > 0 ? 1 : 0;
      out +=
        '<path class="fib-lid" d="M' + n(p1[0]) + ' ' + n(p1[1]) + ' A' + rx + ' ' + ry + ' 0 ' + large + ' 1 ' + n(p2[0]) + ' ' + n(p2[1]) + ' Z" />' +
        '<path class="fib-lash" d="M' + n(p1[0]) + ' ' + n(p1[1]) + ' L' + n(p2[0]) + ' ' + n(p2[1]) + '" />';
    }
    return out;
  }

  let art = {};

  function placeholder(pose) {
    const f = FACE[pose];
    return (
      '<svg viewBox="0 0 120 124" role="img" aria-label="' + ALT[pose] + '">' +
      '<circle class="fib-ring" cx="60" cy="78" r="42" />' +
      '<circle class="fib-head" cx="60" cy="78" r="35" />' +
      '<g transform="rotate(-9 60 44)">' +
      '<rect class="fib-hat" x="41" y="12" width="38" height="31" rx="4" />' +
      '<rect class="fib-band" x="41" y="34" width="38" height="7" />' +
      '<rect class="fib-hat" x="29" y="41" width="62" height="8" rx="4" />' +
      '</g>' +
      eye(45, -1, f) +
      eye(75, 1, f) +
      '<g class="fib-brow">' + f.brows + '</g>' +
      '<path class="fib-mouth' + (f.filled ? ' filled' : '') + '" d="' + f.mouth + '" />' +
      '</svg>'
    );
  }

  // Reads which poses have real art. Missing or broken file: placeholders.
  async function load(base) {
    try {
      const res = await fetch((base || '') + 'assets/fib/poses.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const map = await res.json();
      for (const pose of POSES) {
        const file = map[pose];
        if (typeof file === 'string' && /^[\w.-]+\.(svg|png|webp)$/.test(file)) art[pose] = (base || '') + 'assets/fib/' + file;
      }
    } catch (e) {
      art = {};
    }
  }

  function set(el, pose) {
    if (!POSES.includes(pose)) pose = 'smug';
    el.dataset.fib = pose;
    if (art[pose]) {
      el.innerHTML = '';
      const img = document.createElement('img');
      img.src = art[pose];
      img.alt = ALT[pose];
      img.addEventListener('error', () => {
        el.innerHTML = placeholder(pose);
      });
      el.appendChild(img);
    } else {
      el.innerHTML = placeholder(pose);
    }
  }

  root.AIDetectiveFib = { POSES, load, set };
})(window);
