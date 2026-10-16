// Small DOM helpers shared by the student and teacher pages.
(function (root) {
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // In-page confirm, because embedded viewers block the browser's own dialogs.
  // Needs the #confirm markup on the page.
  function ask(message, yesLabel) {
    const $ = (id) => document.getElementById(id);
    return new Promise((resolve) => {
      const box = $('confirm');
      const opener = document.activeElement;
      $('confirm-msg').textContent = message;
      $('confirm-yes').textContent = yesLabel;
      box.hidden = false;
      $('confirm-no').focus();
      function done(answer) {
        box.hidden = true;
        $('confirm-yes').removeEventListener('click', yes);
        $('confirm-no').removeEventListener('click', no);
        box.removeEventListener('keydown', key);
        if (opener && opener.focus) opener.focus();
        resolve(answer);
      }
      const yes = () => done(true);
      const no = () => done(false);
      const key = (e) => {
        if (e.key === 'Escape') done(false);
      };
      $('confirm-yes').addEventListener('click', yes);
      $('confirm-no').addEventListener('click', no);
      box.addEventListener('keydown', key);
    });
  }

  // Copies text; falls back to selecting it when the clipboard is refused.
  async function copy(text, fallbackNode) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      if (fallbackNode) {
        const range = document.createRange();
        range.selectNodeContents(fallbackNode);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      return false;
    }
  }

  root.AIDetectiveUI = { el, ask, copy };
})(window);
