// The popped-out panel window's own half of the conversation. Deliberately
// almost nothing: the editor window owns the panel and everything in it, and
// this only says hello and goodbye. See js/panels.js.

(function () {
  "use strict";

  const id = new URLSearchParams(window.location.search).get("panel") || "";

  function tell(type) {
    if (!window.opener || window.opener.closed) return;
    try {
      window.opener.postMessage({ __lqPanel: true, type: type, id: id }, "*");
    } catch (err) { /* the editor has gone; nothing to tell */ }
  }

  // The editor is polling for this window closing anyway — this just makes the
  // common case immediate rather than up to half a second late.
  window.addEventListener("pagehide", function () { tell("closing"); });

  // No editor to belong to means an orphan: someone reloaded the editor, or
  // opened this URL directly. Say so rather than sitting there empty.
  if (!window.opener || window.opener.closed) {
    document.getElementById("popped-note").textContent =
      "This window belongs to the level editor, and the editor isn't open. "
      + "Close this and use the ⧉ button on a panel to pop it out again.";
    return;
  }
  document.getElementById("popped-note").remove();
  tell("ready");
})();
