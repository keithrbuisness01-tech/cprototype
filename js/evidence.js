// Draws a "How would you check?" case's evidence (a post, a quote poster, a
// web page, reviews, a chat, a scenario) from plain data in the case file.
// Text is always set as text, never as HTML.
(function (root) {
  const { el } = root.AIDetectiveUI;

  // Images live in assets/evidence/. A self-contained demo page may carry them
  // inline instead (see #demo-images).
  function imageSrc(name) {
    const inline = root.document.getElementById('demo-images');
    if (inline) {
      const map = JSON.parse(inline.textContent);
      if (map[name]) return map[name];
    }
    return 'assets/evidence/' + name;
  }

  const builders = {
    post(e) {
      const box = el('div', 'ev-post');
      const head = el('div', 'ev-post-head');
      head.append(el('span', 'ev-avatar', e.avatar || e.account.slice(0, 2).toUpperCase()), el('span', null, e.account));
      box.appendChild(head);
      if (e.image) {
        const img = el('img', 'ev-image');
        img.src = imageSrc(e.image.src);
        img.alt = e.image.alt;
        box.appendChild(img);
      }
      box.appendChild(el('p', 'ev-post-body', e.text));
      if (e.meta) box.appendChild(el('p', 'ev-meta', e.meta));
      return box;
    },
    quote(e) {
      const box = el('figure', 'ev-quote');
      box.append(el('blockquote', 'ev-quote-text', e.quote), el('figcaption', 'ev-quote-author', e.author));
      if (e.meta) box.appendChild(el('p', 'ev-quote-meta', e.meta));
      return box;
    },
    webpage(e) {
      const box = el('div', 'ev-web');
      box.appendChild(el('p', 'ev-urlbar', e.url));
      const content = el('div', 'ev-web-content');
      content.appendChild(el('h3', null, e.heading));
      for (const p of e.paragraphs) content.appendChild(el('p', null, p));
      if (e.note) content.appendChild(el('p', 'ev-note', e.note));
      box.appendChild(content);
      return box;
    },
    reviews(e) {
      const box = el('div', 'ev-web');
      box.appendChild(el('p', 'ev-urlbar', e.url));
      const content = el('div', 'ev-web-content');
      for (const r of e.reviews) {
        const review = el('div', 'ev-review');
        const stars = el('span', 'ev-stars', '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars));
        stars.setAttribute('aria-label', r.stars + ' out of 5 stars');
        review.append(stars, el('p', null, r.text));
        content.appendChild(review);
      }
      if (e.note) content.appendChild(el('p', 'ev-note', e.note));
      box.appendChild(content);
      return box;
    },
    chat(e) {
      const box = el('div', 'ev-chat');
      for (const m of e.messages) {
        const msg = el('p', 'ev-msg ' + m.from, m.text);
        msg.setAttribute('aria-label', (m.from === 'me' ? 'You' : m.from === 'bot' ? 'Chatbot' : 'Them') + ': ' + m.text);
        box.appendChild(msg);
      }
      return box;
    },
    scenario(e) {
      const box = el('div', 'ev-scenario');
      const p = el('p');
      p.append(el('strong', null, e.label || 'The situation:'), ' ' + e.situation);
      box.append(p, el('p', 'ev-question', e.question));
      return box;
    },
  };

  function render(evidence) {
    const build = builders[evidence.type];
    return build ? build(evidence) : el('p', null, '');
  }

  root.AIDetectiveEvidence = { render };
})(window);
