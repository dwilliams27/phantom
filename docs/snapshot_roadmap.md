# Snapshot Walker Roadmap

Planned extensions to the DOM snapshot walker (phantom-extension/snapshot.js). All are purely additive -- V1 architecture supports them without refactoring.

## Planned Features

### iframe Recursion
Walk into iframe content using `chrome.scripting.executeScript` with `allFrames: true`. Stitch sub-frame trees into the main tree at iframe positions. Each sub-frame result includes its frameId for mapping.

### Shadow DOM Traversal
Walk into open shadow roots via `element.shadowRoot`. Closed shadow roots are inaccessible from any context (by design). Add shadow root detection to the tree walker -- when an element has `.shadowRoot`, recurse into it as a subtree. Mark shadow content in the output for clarity.

### CSS ::before/::after Content
Include pseudo-element text in accessible name computation via `getComputedStyle(el, '::before').content` and `getComputedStyle(el, '::after').content`. Parse CSS content string values (strip quotes). Add to `gatherText()` before/after the child node loop.

### aria-owns Reordering
Reparent elements based on `aria-owns` attribute to match the logical accessibility tree order. An element with `aria-owns="id1 id2"` logically owns those elements as children regardless of DOM position. Implement as a post-processing step after tree construction.

### Ref Stability Across Snapshots
Cache refs on DOM elements (e.g., via a WeakMap or expando property) so the same element gets the same ref number across sequential snapshots. Reduces confusion for the agent when taking multiple snapshots of a page that hasn't changed much. Playwright does this with an internal `_ariaRef` property.

### Incremental/Diff Snapshots
Return only changed portions of the tree to reduce token usage. Compare current snapshot to the previous one, emit changed subtrees with `[changed]` markers and collapse unchanged sections to `[unchanged]`. Requires storing the previous tree for diffing.

## Implementation Priority

1. Shadow DOM -- most likely to be encountered on modern sites
2. iframe recursion -- needed if airlines use iframes for booking widgets
3. CSS content -- needed if sites use pseudo-elements for meaningful text
4. aria-owns -- rare but important for correctness
5. Ref stability -- quality-of-life improvement
6. Incremental snapshots -- optimization for token usage
