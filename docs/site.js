(function () {
  var header = document.querySelector(".site-header");
  var button = header && header.querySelector(".site-menu");
  var nav = document.getElementById("site-nav");

  function setOpen(open) {
    if (!header || !button) return;
    header.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", open ? "true" : "false");
  }

  if (button && nav) {
    button.addEventListener("click", function () {
      setOpen(!header.classList.contains("is-open"));
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setOpen(false);
    });
    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) setOpen(false);
    });
  }

  function selectNode(node) {
    var range = document.createRange();
    range.selectNodeContents(node);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  var copyPage = document.querySelector("button.fixed");
  if (copyPage) {
    copyPage.classList.add("copy-page");
    var footer = document.querySelector("footer");
    if (footer) footer.parentNode.insertBefore(copyPage, footer);
    else document.body.appendChild(copyPage);
  }

  document.querySelectorAll("[data-copy]").forEach(function (control) {
    control.addEventListener("click", function () {
      var node = document.getElementById(control.getAttribute("data-copy"));
      if (!node) return;
      var text = (node.textContent || "").replace(/\s+/g, " ").trim();
      var live = document.getElementById("copy-status");
      var original = control.getAttribute("data-label") || "Copy";

      function report(label, message) {
        control.textContent = label;
        if (live) live.textContent = message;
        window.setTimeout(function () { control.textContent = original; }, 2400);
      }

      function fallback() {
        selectNode(node);
        report("Selected", "Clipboard is blocked. The command is selected. Copy it with the keyboard.");
      }

      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        fallback();
        return;
      }
      navigator.clipboard.writeText(text).then(function () {
        report("Copied", "Copied the command.");
      }).catch(fallback);
    });
  });
})();
