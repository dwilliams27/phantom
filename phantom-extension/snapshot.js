(() => {
"use strict";

// === ROLE TAXONOMY ===

const WIDGET_ROLES = new Set([
  "button", "checkbox", "combobox", "grid", "gridcell", "link", "listbox",
  "menu", "menubar", "menuitem", "menuitemcheckbox", "menuitemradio", "option",
  "progressbar", "radio", "radiogroup", "scrollbar", "searchbox", "slider",
  "spinbutton", "switch", "tab", "tablist", "tabpanel", "textbox", "tree",
  "treegrid", "treeitem",
]);

const LANDMARK_ROLES = new Set([
  "banner", "complementary", "contentinfo", "form", "main", "navigation",
  "region", "search",
]);

const STRUCTURE_ROLES = new Set([
  "article", "blockquote", "caption", "cell", "code", "columnheader",
  "definition", "dialog", "document", "emphasis", "figure", "group",
  "heading", "img", "list", "listitem", "mark", "meter", "paragraph",
  "row", "rowgroup", "rowheader", "separator", "status", "strong",
  "table", "term", "time", "toolbar", "tooltip",
]);

const NAME_FROM_CONTENT_ROLES = new Set([
  "button", "cell", "checkbox", "columnheader", "gridcell", "heading",
  "link", "menuitem", "menuitemcheckbox", "menuitemradio", "option",
  "radio", "row", "rowheader", "switch", "tab", "tooltip", "treeitem",
]);

const NAME_PROHIBITED_ROLES = new Set([
  "caption", "code", "definition", "deletion", "emphasis", "generic",
  "insertion", "mark", "paragraph", "presentation", "none", "strong",
  "subscript", "superscript", "term", "time",
]);

const CHECKED_ROLES = new Set(["checkbox", "menuitemcheckbox", "option", "radio", "switch", "menuitemradio", "treeitem"]);
const EXPANDED_ROLES = new Set(["button", "checkbox", "combobox", "gridcell", "link", "listbox", "menuitem", "row", "rowheader", "tab", "treeitem", "columnheader", "menuitemcheckbox", "menuitemradio", "switch"]);
const SELECTED_ROLES = new Set(["gridcell", "option", "row", "tab", "rowheader", "columnheader", "treeitem"]);
const DISABLED_ROLES = new Set(["button", "checkbox", "combobox", "grid", "gridcell", "group", "link", "listbox", "menu", "menubar", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "radio", "radiogroup", "row", "rowheader", "scrollbar", "searchbox", "slider", "spinbutton", "switch", "tab", "tablist", "textbox", "toolbar", "tree", "treegrid", "treeitem", "columnheader"]);
const LEVEL_ROLES = new Set(["heading", "listitem", "row", "treeitem"]);

const VALID_ROLES = new Set([...WIDGET_ROLES, ...LANDMARK_ROLES, ...STRUCTURE_ROLES, "generic", "none", "presentation"]);

// === IMPLICIT ROLE MAPPING (HTML-AAM) ===

const LANDMARK_BLOCKER = "article:not([role]), aside:not([role]), main:not([role]), nav:not([role]), section:not([role]), [role=article], [role=complementary], [role=main], [role=navigation], [role=region]";

function closestLandmarkBlocker(el) {
  return el.parentElement?.closest(LANDMARK_BLOCKER);
}

function hasAccessibleName(el) {
  return el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby");
}

function hasDatalist(el) {
  const listAttr = el.getAttribute("list");
  if (!listAttr) return false;
  return el.ownerDocument.getElementById(listAttr)?.tagName === "DATALIST";
}

const IMPLICIT_ROLE_MAP = {
  A:        (el) => el.hasAttribute("href") ? "link" : null,
  AREA:     (el) => el.hasAttribute("href") ? "link" : null,
  ARTICLE:  () => "article",
  ASIDE:    (el) => closestLandmarkBlocker(el) ? null : "complementary",
  BUTTON:   () => "button",
  DATALIST: () => "listbox",
  DETAILS:  () => "group",
  DIALOG:   () => "dialog",
  FIELDSET: () => "group",
  FIGURE:   () => "figure",
  FOOTER:   (el) => closestLandmarkBlocker(el) ? null : "contentinfo",
  FORM:     (el) => hasAccessibleName(el) ? "form" : null,
  H1:       () => "heading",
  H2:       () => "heading",
  H3:       () => "heading",
  H4:       () => "heading",
  H5:       () => "heading",
  H6:       () => "heading",
  HEADER:   (el) => closestLandmarkBlocker(el) ? null : "banner",
  HR:       () => "separator",
  IMG:      (el) => (el.getAttribute("alt") === "" && !el.getAttribute("title")) ? "presentation" : "img",
  INPUT:    (el) => {
    const type = (el.type || "text").toLowerCase();
    if (type === "hidden") return null;
    if (type === "search") return hasDatalist(el) ? "combobox" : "searchbox";
    if (["email", "tel", "text", "url", ""].includes(type))
      return hasDatalist(el) ? "combobox" : "textbox";
    const map = {
      button: "button", checkbox: "checkbox", image: "button",
      number: "spinbutton", radio: "radio", range: "slider",
      reset: "button", submit: "button", file: "button",
    };
    return map[type] || "textbox";
  },
  LI:       () => "listitem",
  MAIN:     () => "main",
  MATH:     () => "math",
  MENU:     () => "list",
  METER:    () => "meter",
  NAV:      () => "navigation",
  OL:       () => "list",
  OPTGROUP: () => "group",
  OPTION:   () => "option",
  OUTPUT:   () => "status",
  P:        () => "paragraph",
  PROGRESS: () => "progressbar",
  SEARCH:   () => "search",
  SECTION:  (el) => hasAccessibleName(el) ? "region" : null,
  SELECT:   (el) => (el.hasAttribute("multiple") || el.size > 1) ? "listbox" : "combobox",
  SUMMARY:  (el) => el.parentElement?.tagName === "DETAILS" ? "button" : null,
  TABLE:    () => "table",
  TBODY:    () => "rowgroup",
  TD:       (el) => {
    const tableRole = el.closest("table")?.getAttribute("role");
    return (tableRole === "grid" || tableRole === "treegrid") ? "gridcell" : "cell";
  },
  TEXTAREA: () => "textbox",
  TFOOT:    () => "rowgroup",
  TH:       (el) => {
    const scope = el.getAttribute("scope");
    if (scope === "col" || scope === "colgroup") return "columnheader";
    return (scope === "row" || scope === "rowgroup") ? "rowheader" : "columnheader";
  },
  THEAD:    () => "rowgroup",
  TR:       () => "row",
  UL:       () => "list",
};

const GLOBAL_ARIA_ATTRS = new Set(["aria-atomic", "aria-busy", "aria-controls", "aria-current", "aria-describedby", "aria-details", "aria-dropeffect", "aria-flowto", "aria-grabbed", "aria-hidden", "aria-keyshortcuts", "aria-label", "aria-labelledby", "aria-live", "aria-owns", "aria-relevant", "aria-roledescription"]);

function hasGlobalAriaAttribute(el) {
  for (const attr of el.attributes) {
    if (GLOBAL_ARIA_ATTRS.has(attr.name)) return true;
  }
  return false;
}

function getImplicitRole(el) {
  const fn = IMPLICIT_ROLE_MAP[el.tagName];
  return fn ? fn(el) : null;
}

function getAriaRole(el) {
  const explicit = el.getAttribute("role")?.trim().split(/\s+/)[0];
  if (explicit && VALID_ROLES.has(explicit)) {
    if ((explicit === "none" || explicit === "presentation") &&
        (el.hasAttribute("tabindex") || hasGlobalAriaAttribute(el))) {
      return getImplicitRole(el);
    }
    return explicit;
  }
  return getImplicitRole(el);
}

// === VISIBILITY ===

const SKIP_TAGS = new Set(["STYLE", "SCRIPT", "NOSCRIPT", "TEMPLATE"]);
const hiddenCache = new WeakMap();

function isHidden(el) {
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.getAttribute("aria-hidden") === "true") return true;
  const style = getComputedStyle(el);
  if (style.display === "none") return true;
  if (style.visibility === "hidden" || style.visibility === "collapse") return true;
  return isAncestorHidden(el.parentElement);
}

function isAncestorHidden(el) {
  if (!el || el === document.documentElement) return false;
  const cached = hiddenCache.get(el);
  if (cached !== undefined) return cached;
  const hidden = el.getAttribute("aria-hidden") === "true"
    || getComputedStyle(el).display === "none"
    || isAncestorHidden(el.parentElement);
  hiddenCache.set(el, hidden);
  return hidden;
}

// === ACCESSIBLE NAME COMPUTATION (W3C accname-1.2) ===

function computeName(el, opts = {}) {
  const { visited = new Set(), inLabelledBy = false, inLabel = false, includeHidden = false } = opts;
  if (visited.has(el)) return "";
  visited.add(el);
  const role = getAriaRole(el);
  if (NAME_PROHIBITED_ROLES.has(role) && !inLabelledBy && !inLabel) return "";
  if (!includeHidden && isHidden(el)) return "";

  // aria-labelledby (needs isolated visited set per spec -- labelledby starts a new traversal context)
  if (!inLabelledBy) {
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const parts = [];
      for (const id of labelledBy.split(/\s+/).filter(Boolean)) {
        const ref = document.getElementById(id);
        if (ref && !visited.has(ref)) {
          parts.push(computeName(ref, { visited: new Set(visited), inLabelledBy: true, includeHidden: true }));
        }
      }
      const result = parts.join(" ").trim();
      if (result) return result;
    }
  }

  // Embedded control value (when inside a label)
  if (inLabelledBy || inLabel) {
    if (role === "textbox" || role === "searchbox") return el.value ?? el.textContent ?? "";
    if (role === "combobox" || role === "listbox") {
      const selected = el.querySelector("option:checked");
      if (selected) return selected.textContent.trim();
    }
    if (role === "slider" || role === "spinbutton" || role === "progressbar") {
      return el.getAttribute("aria-valuetext") || el.getAttribute("aria-valuenow") || el.value || "";
    }
  }

  // aria-label
  const ariaLabel = el.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;

  const tag = el.tagName;

  // alt text
  if (tag === "IMG" || tag === "AREA") {
    const alt = el.getAttribute("alt");
    if (alt?.trim()) return alt.trim();
  }

  // <label for> association
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "OUTPUT") {
    const labels = el.labels;
    if (labels?.length) {
      const result = Array.from(labels)
        .map(l => computeName(l, { visited, inLabel: true }))
        .filter(Boolean).join(" ");
      if (result) return result;
    }
    if ((tag === "INPUT" || tag === "TEXTAREA") && !inLabel) {
      const ph = el.getAttribute("placeholder");
      if (ph?.trim()) return ph.trim();
    }
  }

  // <fieldset> → <legend>
  if (tag === "FIELDSET") {
    const legend = el.querySelector(":scope > legend");
    if (legend) {
      const name = computeName(legend, { visited, inLabel: true });
      if (name) return name;
    }
  }

  // Name from content
  if (NAME_FROM_CONTENT_ROLES.has(role) || inLabelledBy || inLabel) {
    const text = gatherText(el, visited, inLabelledBy, inLabel);
    if (text.trim()) return text.trim();
  }

  // title fallback
  const title = el.getAttribute("title");
  if (title?.trim()) return title.trim();

  return "";
}

function gatherText(el, visited, inLabelledBy, inLabel) {
  const tokens = [];
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      tokens.push(child.textContent);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const childName = computeName(child, { visited, inLabelledBy, inLabel });
      const display = getComputedStyle(child).display;
      if (display !== "inline" && display !== "contents") {
        tokens.push(" " + childName + " ");
      } else {
        tokens.push(childName);
      }
    }
  }
  return tokens.join("");
}

// === TREE WALKER ===

const MAX_DEPTH = 40;
const MAX_NODES = 500;
const LIST_TRUNCATE_AFTER = 5;

function shouldInclude(el, role) {
  if (role && role !== "generic" && role !== "none" && role !== "presentation") return true;
  if (el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby")) return true;
  if (el.hasAttribute("tabindex")) return true;
  return false;
}

function shouldGetRef(el, role) {
  if (WIDGET_ROLES.has(role)) return true;
  if (el.hasAttribute("tabindex") && el.getAttribute("tabindex") !== "-1") return true;
  return false;
}

function getImplicitLevel(el) {
  const match = el.tagName.match(/^H([1-6])$/);
  return match ? parseInt(match[1], 10) : null;
}

function collectProps(el, role) {
  const props = {};
  if (CHECKED_ROLES.has(role)) {
    const checked = el.getAttribute("aria-checked") ?? (el.checked === true ? "true" : null);
    if (checked === "true") props.checked = true;
    else if (checked === "mixed") props.checked = "mixed";
  }
  if (EXPANDED_ROLES.has(role) && el.hasAttribute("aria-expanded")) {
    props.expanded = el.getAttribute("aria-expanded") === "true";
  }
  if (DISABLED_ROLES.has(role)) {
    if (el.disabled || el.getAttribute("aria-disabled") === "true") props.disabled = true;
  }
  if (SELECTED_ROLES.has(role) && el.hasAttribute("aria-selected")) {
    props.selected = el.getAttribute("aria-selected") === "true";
  }
  if (LEVEL_ROLES.has(role)) {
    const level = el.getAttribute("aria-level") || getImplicitLevel(el);
    if (level) props.level = typeof level === "number" ? level : parseInt(level, 10);
  }
  if (role === "textbox" || role === "searchbox" || role === "combobox" || role === "spinbutton") {
    if ("value" in el) props.value = el.value;
  }
  return props;
}

function buildTree(rootEl) {
  const refMap = new Map();
  let nextRef = 0;
  let nodeCount = 0;

  function walk(el, parentNode, depth) {
    if (depth > MAX_DEPTH) return;
    if (isHidden(el)) return;

    const role = getAriaRole(el);
    const include = shouldInclude(el, role);

    let currentNode;
    if (include) {
      nodeCount++;
      const name = computeName(el);
      currentNode = { role: role || "generic", name, children: [], ref: null, props: collectProps(el, role) };
      if (shouldGetRef(el, role)) {
        currentNode.ref = nextRef;
        refMap.set(nextRef, el);
        nextRef++;
      }
      parentNode.children.push(currentNode);
    } else {
      currentNode = parentNode;
    }

    // Recurse into child elements
    for (const child of el.children) {
      walk(child, currentNode, include ? depth + 1 : depth);
    }

    // Capture direct text nodes (bubble up to currentNode for flattened elements too)
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent.trim();
        if (text && text !== currentNode.name) {
          currentNode.children.push(text);
        }
      }
    }

    // Truncate long lists
    if (include && (role === "list" || role === "listbox") && currentNode.children.length > LIST_TRUNCATE_AFTER + 3 && nodeCount > MAX_NODES) {
      const total = currentNode.children.length;
      currentNode.children = currentNode.children.slice(0, LIST_TRUNCATE_AFTER);
      currentNode.children.push(`... ${total - LIST_TRUNCATE_AFTER} more items`);
    }
  }

  const root = { role: "RootWebArea", name: document.title, url: document.URL, children: [], ref: null, props: {} };
  walk(rootEl, root, 0);
  return { root, refMap };
}

// === SERIALIZER ===

function escapeName(str) {
  if (str.length > 120) str = str.substring(0, 117) + "...";
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ").replace(/\s+/g, " ");
}

function serialize(root) {
  const lines = [];

  function visit(node, depth) {
    let line = "  ".repeat(depth);
    if (node.ref !== null && node.ref !== undefined) line += `[${node.ref}] `;
    line += node.role;
    if (node.name) line += ` "${escapeName(node.name)}"`;
    if (node.url) line += ` url="${node.url}"`;
    const p = node.props || {};
    if (p.level !== undefined) line += ` level=${p.level}`;
    if (p.checked === true) line += " checked";
    else if (p.checked === "mixed") line += " checked=mixed";
    if (p.expanded === true) line += " expanded";
    else if (p.expanded === false) line += " expanded=false";
    if (p.disabled) line += " disabled";
    if (p.selected) line += " selected";
    if (p.value !== undefined && p.value !== "") line += ` value="${escapeName(String(p.value))}"`;
    lines.push(line);

    for (const child of node.children || []) {
      if (typeof child === "string") {
        lines.push("  ".repeat(depth + 1) + `"${escapeName(child)}"`);
      } else {
        visit(child, depth + 1);
      }
    }
  }

  visit(root, 0);
  return lines.join("\n");
}

// === ENTRY POINT ===

const { root, refMap } = buildTree(document.body);

// Batch geometry reads (single reflow)
const rects = new Map();
for (const [ref, el] of refMap) {
  rects.set(ref, el.getBoundingClientRect());
}

// Store for subsequent get_element_rect calls
globalThis.__phantom_refs = refMap;
globalThis.__phantom_rects = rects;

return { tree: serialize(root), refCount: refMap.size };

})();
