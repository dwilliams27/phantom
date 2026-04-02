# Enhancements Wishlist

Running list of planned improvements, ideas, and deferred features. Remove items when they ship.

## Snapshot Walker

- **Shadow DOM traversal**: Walk into open shadow roots via `element.shadowRoot`. Recurse as subtree, mark shadow content in output.
- **iframe recursion**: Use `chrome.scripting.executeScript` with `allFrames: true`. Stitch sub-frame trees into main tree at iframe positions.
- **CSS ::before/::after content**: Include pseudo-element text in accessible name computation via `getComputedStyle(el, '::before').content`.
- **aria-owns reordering**: Reparent elements based on `aria-owns` to match logical accessibility tree order. Post-processing step after tree construction.
- **Ref stability across snapshots**: Cache refs on DOM elements (WeakMap or expando) so same element keeps same ref number across sequential snapshots.
- **Incremental/diff snapshots**: Return only changed portions of tree to reduce token usage. Compare to previous snapshot, emit `[changed]`/`[unchanged]` markers.
