# Change Log

## v0.3.13
- [cpp] Add a status bar button to select an active cpp build configuration
- Recently opened workspaces history 
- [git/blame] convert to toggle command
- [cpp] Watch changes to compile_commands.json
- [ts] one ls for all js related languages
- [terminal] update to xterm.js 3.5.0
- Reimplemented further widgets with use of React JSX
- Do not store markers in browser local storage by default
- fix #2315: fine grain marker tree computation
- [tree] don't render collapsed nodes
- [textmate] added C/C++, Java, Python, CSS, html, less, markdown, shell, xml, yaml
- Misc components re-impplemented using react


## v0.3.12
- New Plugin system !
    - See [design](https://github.com/theia-ide/theia/issues/1482) and [documentation](https://github.com/theia-ide/theia/blob/master/packages/plugin/API.md) for more details.
- Introducing [Task API](https://github.com/theia-ide/theia/pull/2086).
    - Note, the format of tasks.json has been changed. For details, see the Task extension's [README.md](https://github.com/theia-ide/theia/blob/master/packages/task/README.md).
- `HTML` files now open in the editor by default.
- `Search In Folder...` new feature !
- `git commit` now alerts the user if no files are staged.
- `.md` files that are edited in `diff` mode now correctly open with the editor.
- Added an UI when developing plugins.
- Theia alerts you when the opening of a new tab is denied by the browser.
- Migrated widgets to `react`.
- The workspace root can no longer be deleted.
- Fixed `git` unstaging feature.
- Added quick option to toggle the autosave feature.
- Added the missing `Search` menu item !
- `File Download` feature !
- Textmate syntax coloring support ! (works on `.ts` files for now until more grammars are registered)
- A lot of fixes and improvements !

## v0.3.11
- Delete files on OSX with cmd+backspace.
- Changed the font in the editor.
- Logger's level can be set more finely.
- `jdt.ls` download on postinstall.
- Fixed the capital `R` key (<kbd>shift + r</kbd>) not working in the editor.
- It is now possible to toggle hidden files in the navigator.
- Search and replace widget !
- Search can work in hidden files.
- Fixed several memory leaks.
- Added `git sync` and `git publish` actions.
- General fixes and improvements.
