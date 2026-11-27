# Manual test plan for Monaco uplifts

Monaco is Theia's code editor: text editors, diff editors, quick input, and the inputs of the debug console, notebooks and the AI chat.
Run this plan after every `@theia/monaco-editor-core` uplift, in the browser and in Electron; it can be handed to a testing agent as is.
Record the results per uplift (pass, finding, not tested) and add new checks and known issues here and in [GUIDE.md](GUIDE.md).
It replaces the wiki checklist "Testing a Monaco Uplift" (drawn from #7149).

## Setup

- Build and start both apps: `npm run build:browser` and `npm run start:browser`, `npm run build:electron` and `npm run start:electron`. Rebuild after every fix.
- Built-in extensions: `npm run download:plugins`. Most language features come from them (TypeScript, CSS, HTML, JSON, Git).
- Workspace: a small TypeScript project with a few files that import each other, plus a CSS, an HTML, a JSON and a Markdown file, in a Git repository with uncommitted changes in two files.
- Baseline: if a behaviour looks new, compare with a build of `master` before reporting it.
- Before testing, list the changes of this uplift from the VS Code release notes and the guide's known issues, and check each of them explicitly.
- Keep the browser console (DevTools in Electron: Help > Toggle Developer Tools) open the whole time.

## Automated

- [ ] `npm run test:browser` passes. `examples/api-tests/src/typescript.spec.js` covers these language features with the TypeScript built-in: formatting in the context menu and the command palette, reveal and peek definition (within an editor, to another editor, to an editor preview, incl. focus and the peek staying open), completion and its navigation, rename, signature help, hover, occurrence highlights, go to implementation and type definition, reference code lens, quick fix, document and selection formatting, code actions and the references view. `monaco-api.spec.js`, `find-replace.spec.js` and `undo-redo-selectAll.spec.js` cover keybinding resolution, the opener, context keys, find/replace and undo/redo.
- [ ] `npx lerna run test --scope @theia/monaco` passes (`monaco-init`, `monaco-nls`, preference schema specs).
- [ ] The API tests write `examples/browser/.theia/settings.json` and `tasks.json`: restore them afterwards.

## Editor

- [ ] Opening files and switching tabs is not slower than on `master`; syntax highlighting appears at once.
- [ ] Completion, hover with rendered Markdown, rename across files and Find All References work by hand as well (spot check of the automated part).
- [ ] Editor context menu with right-click and with Shift+F10: both show the language items (Go to Definition, Rename...). The keyboard path goes through Theia's `IContextMenuService` override with a coordinate anchor.
- [ ] Peek references and peek definition: Escape closes the peek widget.
- [ ] Go to Symbol in Editor (Ctrl+Shift+O) lists the symbols of the file; Open Workspace Symbol from the command palette finds symbols of other files.
- [ ] CSS: color decorators next to colors, the color picker opens on hover.
- [ ] HTML: links are underlined on hover and open with Ctrl+click.
- [ ] Folding of TypeScript, CSS and HTML: fold and unfold by the gutter and by command.
- [ ] Find widget (Ctrl+F) and replace (Ctrl+H): matches, replace one and all, regex.
- [ ] Minimap, sticky scroll, breadcrumbs and the empty editor hint render.
- [ ] Edit and Selection menu items act on the editor (undo, redo, cut, copy, paste, expand selection, add cursor, select all).
- [ ] Language auto detection: paste code into a new untitled file, the language mode in the status bar changes.

## Diff editors

- [ ] Open a changed file from the Source Control view: side by side and inline diff (toggle in the toolbar), navigate between changes.
- [ ] Revert and stage a hunk from the dirty diff in the gutter of the editor.
- [ ] Multi-diff editor (Git: View Changes): navigation between files and changes, collapse/expand all, editing the modified side.

## Quick input

- [ ] Command palette: entries show their keybindings, and the keybinding of a Monaco command (e.g. Toggle Line Comment) runs it.
- [ ] Fuzzy search in the command palette and in quick open (Ctrl+P), `?` shows the help.
- [ ] Buttons and links in item descriptions work.
- [ ] Open the command palette after a reload before any editor was opened: it is not distorted and has no `Got bad scroll event` in the console.
- [ ] A quick pick of a VS Code extension (e.g. a sample extension or Git: Checkout to...) works.

## Preferences

- [ ] Change editor preferences in the preferences UI and in `settings.json` (`editor.fontSize`, `editor.wordWrap`, `editor.minimap.enabled`, a language-specific override): open editors update at once.
- [ ] Old values of changed options keep working: `editor.hover.enabled: false` acts as `off`, `editor.minimap.autohide: true` as `mouseover`.
- [ ] The preferences UI shows no `onExP` labels next to editor options.

## Debug

- [ ] Debug console input: Enter accepts the selected suggestion, a second Enter evaluates; Up/Down move in the suggest widget, otherwise through the history. Theia's console keybindings use Monaco context keys (`suggestWidgetVisible`, `suggestWidgetHasFocusedSuggestion`, `suggestionMakesTextEdit`), which an uplift can rename.
- [ ] Breakpoints: set, remove and disable in the gutter; the inline breakpoint editor of Edit Breakpoint accepts a condition, a hit count and a log message.

## Other inputs and views

- [ ] Output view renders, and its find widget works.
- [ ] Notebook: edit cells, Space types a space and does not scroll the notebook.
- [ ] AI chat input: typing, the suggest widget for `@` and `/` is styled, paste of text and of an image.
- [ ] Editor in a secondary window: typing works, its suggest widget and hovers are styled.
- [ ] Switch the color theme (light, dark, high contrast): editors, diff editors and popups follow.
- [ ] Display language German (Configure Display Language): the Monaco context menu, the find widget and the Selection menu are translated.
- [ ] Plugins: a tree view of a VS Code extension shows its context menu entries depending on its `when` clauses; editor decorations of an extension (e.g. Git blame or bracket highlighting) render.
- [ ] Tasks: `tasks.json` offers completion and hover from its schema; a task with a problem matcher shows its markers in the editor and the Problems view (scenario of #7149).
- [ ] Help > About shows the new Monaco version.
- [ ] No errors in the console during the whole run, in particular no `StandaloneServices was already initialized`.

## Electron

- [ ] Clipboard: copy, cut and paste in the editor, the quick input and the AI chat input, also an image into the chat.
- [ ] Spot check of the editor, the diff editor and the command palette.

## Optional

- [ ] Smoke test language extensions with their own tool chain (Go, Python, Java with the debug and test extensions, e.g. the run/debug code lenses of https://github.com/kasecato/vscode-javadebug-sample): use the editor for a bit, check the frontend and backend logs.

## Known, not bugs (as of 1.144.1)

- In the browser app, Go to Definition is Ctrl+F11 (F12 opens the devtools) and Ctrl+T is taken by the browser.
- Strings are translated by their English default value; an ambiguous one (e.g. "References") can stay English.
- Typing lag in a workspace with large expanded folders comes from the file decorations, not from Monaco (see the guide's known issues).

## Notes for testing agents

- Monaco uses the EditContext API, not a `<textarea>`: type with real keyboard input (Playwright `keyboard.type()` or `keyboard.insertText()`), synthetic DOM events do not reach the editor. Pasting needs a real clipboard.
- Electron cannot be driven with the browser setup; leave it to a manual run.
- Extensions that need a tool chain (JDK, Go, Python) are optional; mark them as not tested if it is missing.
- Look up menu items and commands by label, not by index.
- List every change made to the workspace or settings, and revert it at the end.

## Report

For each failure: steps, expected and actual result, browser or Electron, a screenshot, and whether `master` behaves the same. Summarize what was not tested.
