# Changelog 2018

## v0.3.18 - 20/12/2018

- [core] added a preference to define how to handle application exit
- [core] added a way to prevent application exit from extensions
- [core] added functionality to prevent application exit if some editors are dirty
- [core] allowed the ability to scope bindings per connection
- [core] fixed `@theia/core/lib/node/debug#DEBUG_MODE` flag to correctly detect when the runtime is inspected/debugged
- [cpp] fixed clangd being prematurely started when a build config is active
- [electron] implemented HTTP-based authentication for Git
- [electron] updated Electron to `^2.0.14`
- [electron] updated Git for Electron to fall back to embedded Git if no Git is found on the `PATH`
- [file-search] added ability to search files from multiple-root workspaces
- [file-search] improved handling when attempting to open non-existent files from the `quick-open-file`
- [filesystem] added the ability to convert URIs to platform specific paths
- [git] updated Git view to display short hash when on detached state
- [java-debug] added major enhancements to `java-debug`
- [keybinding] normalized key sequences to US layout
- [languages] added a preference for every language contribution to be able to trace the communication client <-> server
- [languages] allowed the ability to provide Language Server start options
- [languages] fixed leaking language clients
- [languages][java] reuse `jdt.ls` workspace
- [monaco] fixed keybindings on OSX
- [plug-in] added Plug-in API for language server contributions
- [plug-in] added `storagePath` Plug-in API
- [plug-in] added `tasks.registerTaskProvider` Plug-in API
- [plug-in] added `window.withProgress` Plug-in API
- [plug-in] added ability to register keybindings from a Plug-in's `package.json`
- [plug-in] added open link command
- [plug-in] added support for context menus in contributed views
- [plug-in] implemented API to get workspace folder by a given file URI
- [plug-in][languages] added ability to register a document highlight provider
- [search-in-workspace] added ability to perform 'Find in Folder...' with multiple folders simultaneously
- [search-in-workspace] added match and file count to search-in-workspace
- [search-in-workspace] added support for multiple-root workspaces
- [search-in-workspace] fixed path issues by instead using URIs
- [terminal] added ability to choose terminal root location when a workspace contains multiple roots
- [workspace] fixed long label computations for multiple-root workspaces
- [xterm] updated Xterm to `3.9.1`

## v0.3.17 - 29/11/2018

- Added better widget error handling for different use cases (ex: no workspace present, no repository present, ...)
- Addressed multiple backend memory leaks
- Prefixed quick-open commands for easier categorization and searching
- Refactored `Task` menu items into the new `Terminal` menu
- [core] added `theia.applicationName` to application `package.json` and improved window title
- [core] added graceful handling of init and re-connection errors
- [core] added the keybinding `ctrl+alt+a` and `ctrl+alt+d` to switch tabs left/right
- [core] added the menu item `Find Command...` to easily trigger quick-open commands
- [core] added toolbar support for tab-bars
- [core] updated the status-bar display when offline
- [cpp] updated the keybinding for `Switch Header/Source` from `Option+o` to `Option+Command+o` when on macOS
- [debug] added the ability to fork a debug adapter
- [debug] added the ability to trace the debug adapter communication
- [debug] implemented major frontend and backend debug improvements
- [electron] miscellaneous stability and usability improvements on Electron
- [getting-started] added `Getting Started Widget` - used to view common commands, recent workspaces, and helpful links
- [lsp] added new symbol types and increased existing workspace symbol resilience
- [lsp] registered 'Restart' commands for each language server started for miscellaneous purposes
- [markers] added the context menu item `Collapse All` for problem markers
- [mini-browser] miscellaneous mini-browser improvements
- [plug-in] added Plug-in API to communicate between Theia and plugins
- [plug-in] added `languages.registerCodeLensProvider` Plug-in API
- [plug-in] added `languages.registerDocumentSymbolProvider` Plug-in API
- [plug-in] added `window.showTextDocument` Plug-in API
- [plug-in] added ability to provide custom namespaces for the Plug-in API
- [plug-in] registered a type definition provider
- [plug-in] added `tasks.registerTaskProvider` Plug-in API
- [preview-editor] added the ability to open editors in preview mode
- [process] added the ability to create new node processes through forking
- [search-in-workspace] prompted users when performing `Replace All...` to limit accidental triggering
- [search-in-workspace] fixed issue when selecting a file, the command `Find in Folder...` searches from the node's closest parent
- [terminal] added the menu item and command `Split Terminal`
- [workspace] added the ability to open multiple files simultaneously from the file navigator
- [workspace] added the context menu item `Collapse All` for the file navigator
- [workspace] included workspace path as part of the URL fragment

## v0.3.16 - 25/10/2018

- Reverted [cpp] Add debugging for C/C++ programs. This feature will come back in its own cpp-specific repo
- [callhierarchy][typescript] adapt to hierarchical document symbols
- [core] added methods to un-register menus, commands and keybindings
- [debug] decoupled debug model from UI + clean up
- [markers] added ability to remove markers
- [output] added a button to clear output view
- [plug-in] Terminal.sendText API adds a new line to the text being sent to the terminal if `addNewLine` parameter wasn't specified
- [plug-in] added `DocumentLinkProvider` Plug-in API
- [terminal] added 'open in terminal' to navigator
- [windows] implemented drives selector for the file dialog

## v0.3.15 - 27/09/2018

- [cpp] added debugging for C/C++ programs
- [debug] added debug toolbar
- [debug] resolved variables in configurations
- [debug] updated debug session views to act like panels
- [keymaps] added new `View Keybindings Widget` - used to view search and edit keybindings
- [languages] added TCL grammar file
- [plug-in] added `menus` contribution point
- [workspace] added multi-root workspace support with vscode compatibility

## v0.3.13 - 30/08/2018

- Re-implemented additional widgets using React
- Re-implemented miscellaneous components using React
- [cpp] added a status bar button to select an active cpp build configuration
- [cpp] implemented watch changes to compile_commands.json
- [git/blame] added support for convert to toggle command
- [markers] fixed #2315: fine grain marker tree computation
- [markers] improved performance by no longer storing markers in browser local storage by default
- [terminal] updated to xterm.js 3.5.0
- [textmate] added C/C++, Java, Python, CSS, html, less, markdown, shell, xml, yaml
- [tree] improved performance by not rendering collapsed nodes
- [ts] added support for one ls for all JavaScript related languages
- [workspace] added support for recently opened workspaces history

## v0.3.12 - 28/06/2018

- New Plugin system !
  - See [design](https://github.com/theia-ide/theia/issues/1482) and [documentation](https://github.com/theia-ide/theia/blob/master/packages/plugin/API.md) for more details.
- Introducing [Task API](https://github.com/theia-ide/theia/pull/2086).
  - Note, the format of tasks.json has been changed. For details, see the Task extension's [README.md](https://github.com/theia-ide/theia/blob/master/packages/task/README.md).
- Added an UI when developing plugins
- Migrated widgets to `react`
- Theia alerts you when the opening of a new tab is denied by the browser
- [core] added quick option to toggle the autosave feature
- [filesystem] added `File Download` feature
- [git] `git commit` now alerts the user if no files are staged
- [git] fixed `git` unstaging feature
- [languages] added textmate syntax coloring support (works on `.ts` files for now until more grammars are registered)
- [search-in-workspace] added new command `Search In Folder...`
- [search-in-workspace] added the missing `Search` menu item
- [workspace] fixed issue to prevent workspace root from being be deleted
- `.md` files that are edited in `diff` mode now correctly open with the editor
- `HTML` files now open in the editor by default

## v0.3.11 - 06/06/2018

- Added search and replace widget
- Added the ability to delete files on OSX with cmd+backspace
- Added the ability to set more finely grained logger levels
- Fixed several memory leaks.
- [editor] changed the font in the editor
- [editor] fixed the capital `R` key (<kbd>shift + r</kbd>) not working in the editor
- [file-search] added support for search in hidden files
- [git] added `git sync` and `git publish` actions
- [navigator] added the ability to toggle hidden files in the navigator
- `jdt.ls` download on postinstall
