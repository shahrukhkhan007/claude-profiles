'use strict';
// Build a pgrep/regex needle that matches a process ONLY when it carries this
// exact --user-data-dir value as a whole argument. Without the anchor, a plain
// substring match means a profile whose data-dir path is a prefix of another's
// (e.g. "Claude-k" inside "Claude-ki") matches the wrong process, so launching
// or stopping one profile wrongly affects another. The trailing ( |$) requires
// the dir token to end there — the next flag's leading space, or end of the
// command line.
function uddNeedle(dataDir) {
  const esc = String(dataDir).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return '--user-data-dir=' + esc + '( |$)';
}
module.exports = { uddNeedle };
