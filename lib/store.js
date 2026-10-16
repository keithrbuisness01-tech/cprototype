// JSON files in the data directory. Small enough to keep in memory and write
// whole on every change; writes go through a temp file so a crash can't leave
// half a file behind.
const fs = require('fs');
const path = require('path');

function jsonFile(file, fallback) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    data = fallback();
  }
  return {
    get data() {
      return data;
    },
    save() {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, file);
    },
  };
}

function openStore(dataDir) {
  return {
    // Teacher-owned class records: code, settings, share link. No student data.
    classes: jsonFile(path.join(dataDir, 'classes.json'), () => ({})),
    // Anonymous totals per class and case set: counts only.
    totals: jsonFile(path.join(dataDir, 'totals.json'), () => ({})),
    // Lesson-planner spending per calendar month.
    spend: jsonFile(path.join(dataDir, 'ai-spend.json'), () => ({})),
  };
}

module.exports = { openStore };
