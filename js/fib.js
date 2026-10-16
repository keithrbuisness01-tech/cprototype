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

  // Placeholder face parts per pose.
  const FACE = {
    scheming: {
      brows: '<path d="M40 54 L53 60" /><path d="M67 60 L80 54" />',
      eyeRy: 3.2, gaze: [3, 0.5],
      mouth: 'M44 95 Q60 106 76 93', filled: false,
    },
    smug: {
      brows: '<path d="M40 59 L52 61" /><path d="M68 58 L80 50" />',
      eyeRy: 5.5, gaze: [2.5, 0],
      mouth: 'M48 97 Q62 104 76 93', filled: false,
    },
    caught: {
      brows: '<path d="M40 50 L52 47" /><path d="M68 47 L80 50" />',
      eyeRy: 7, gaze: [0, 0],
      mouth: 'M50 99 L55 95 L60 99 L65 95 L70 99', filled: false,
    },
    sulking: {
      brows: '<path d="M40 55 L52 51" /><path d="M68 51 L80 55" />',
      eyeRy: 4.5, gaze: [-1, 2],
      mouth: 'M48 103 Q60 94 72 103', filled: false,
    },
    impressed: {
      brows: '<path d="M40 49 L52 46" /><path d="M68 46 L80 49" />',
      eyeRy: 6.5, gaze: [0, -1],
      mouth: 'M53 97 Q60 90 67 97 Q60 106 53 97 Z', filled: true,
    },
  };

  let art = {};

  function placeholder(pose) {
    const f = FACE[pose];
    const [gx, gy] = f.gaze;
    return (
      '<svg viewBox="0 0 120 124" role="img" aria-label="' + ALT[pose] + '">' +
      '<circle class="fib-ring" cx="60" cy="78" r="42" />' +
      '<circle class="fib-head" cx="60" cy="78" r="35" />' +
      '<g transform="rotate(-9 60 44)">' +
      '<rect class="fib-hat" x="41" y="12" width="38" height="31" rx="4" />' +
      '<rect class="fib-band" x="41" y="34" width="38" height="7" />' +
      '<rect class="fib-hat" x="29" y="41" width="62" height="8" rx="4" />' +
      '</g>' +
      '<g class="fib-brow">' + f.brows + '</g>' +
      '<path class="fib-mask" d="M24 66 L33 69 Q60 58 87 69 L96 66 L94 78 L89 76 Q88 88 77 88 Q67 88 60 80 Q53 88 43 88 Q32 88 31 76 L26 78 Z" />' +
      '<ellipse class="fib-eye" cx="45" cy="75" rx="6.5" ry="' + f.eyeRy + '" />' +
      '<ellipse class="fib-eye" cx="75" cy="75" rx="6.5" ry="' + f.eyeRy + '" />' +
      '<circle class="fib-pupil" cx="' + (45 + gx) + '" cy="' + (75 + gy) + '" r="2.8" />' +
      '<circle class="fib-pupil" cx="' + (75 + gx) + '" cy="' + (75 + gy) + '" r="2.8" />' +
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
