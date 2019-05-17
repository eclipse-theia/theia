# Change Log

## v0.7.0

- [core] added support for several international keyboard layouts
- [core] implemented auto-detection of keyboard layout based on pressed keys
- [core] added command to manually choose a keyboard layout

Breaking changes:

- [preferences] refactored to integrate launch configurations as preferences
- [filesystem] extracted `FileUploadService` and refactored `FileTreeWidget` to use it [#5086](https://github.com/theia-ide/theia/pull/5086)
  - moved `FileDownloadCommands.UPLOAD` to `FileSystemCommands.UPLOAD`
- [scm] added Source Control Model
- [git] bind Git UI to SCM  

## v0.6.0

- Allowed the creation of sub-files and/or sub-folders if name has `/`
- [core] added `files.enableTrash` preference
- [core] added support for custom React toolbar widgets
- [core] added support for tail decorators
- [core] aligned the statusbar styles with VSCode
- [core] updated the prefix quick-open service to support `actionProviders`
- [cpp] added support for block comment auto-closing pairs
- [editor-preview] fixed error at application startup if no preview editors are opened
- [editor-preview] fixed the `goToDefinition` failure when in editor preview mode
- [electron] added the ability to run plugins by binding the components on the backend
- [electron] added the configure Plug-ins option to the start script
- [electron] updated Electron to include a `minWidth` and `minHeight`
- [electron] upgraded version of Electron used to version 3
- [filesystem] added the menu item `Upload Files...` to easily upload files into a workspace
- [filesystem] implemented `Save As` including a save dialog, and new command
- [filesystem] updated the handling when attempting to perform copying when the source and target are the same
- [git] added ability to toggle `Git History` widget
- [git] fixed `Discard All` alignment when the `Git` widget is too narrow
- [git] fixed `Git History` widget alignment and behavior issues
- [git] updated the ahead/behind icons on the statusbar
- [keyboard] aligned the file and event naming conventions
- [languages] updated error type for backwards compatibility
- [plugin-ext] fixed the Plug-in path selection dialog for the hosted instance
- [plugin] added `CodeActionKind` `intersects` Plug-in API
- [plugin] added necessary Webview Plug-in APIs
- [plugin] added propagation of `thisArg` on `registerCommand`
- [plugin] added support for Gulp, Jake, Grunt Plug-in extensions
- [plugin] added support for extensions without activation functions
- [plugin] added the ability to choose through the CLI which VSCode API version to use
- [plugin] aligned `window.setStatusBarMessage` with VSCode
- [plugin] fixed `vscode.open` command by adding checks on arguments
- [plugin] fixed implementation of `vscode.diff` command
- [plugin] fixed issue where webviews were not focused or revealed properly
- [plugin] fixed memory leak on Plug-ins reload
- [plugin] fixed serialization of `Range` object
- [plugin] fixed the registration of text decoration keys
- [plugin] updated Plug-in language services to hook in monaco cancellation tokens
- [preferences] added ability to override default application preference values
- [search-in-workspace] added the ability to pass the currently selected editor text when searching
- [security] fixed XSS vulnerability
- [task] added command to clear task history
- [task] added support to configure tasks
- [task] added the ability to configure tasks
- [task] added the ability to display recently used tasks
- [task] updated the tasks quick-open menu including alignment, category labels and borders
- [terminal] updated terminal preference's minimum value for `lineHeight` and `fontSize`
- [textmate-grammars] added php grammar
- [textmate-grammars] added rust grammar
- [textmate-grammars] fixed incorrect jsx scope
- [tree] added support for icons in node tail decorators
- [workspace] allowed the creation of files and folders using recursive paths
- [workspace] fixed incorrect file-icon when displaying recent workspaces

Breaking changes:

- [core] added support native keyboard layouts [#4724](https://github.com/theia-ide/theia/pull/4724)
- [dialog] updated `validate` and `accept` methods so they are now Promisified [#4764](https://github.com/theia-ide/theia/pull/4764)
- [editor] turned off autoSave by default to align with VSCode [#4777](https://github.com/theia-ide/theia/pull/4777)
  - default settings can be overridden in application package.json:
  ```json
  {
    "private": true,
    "name": "myapp",
    "theia": {
      "frontend": {
        "config": {
          "preferences": {
            "editor.autoSave": "on"
          }
        }
      }
    }
  }
  ```
- [electron] removed cluster mode and startup timeout setting
- [electron] updated Electron to make runtime dependencies optional [#4873](https://github.com/theia-ide/theia/pull/4873)
- [extension-manager] deprecated [#4876](https://github.com/theia-ide/theia/pull/4876)
- [node] moved to using Node.js version 10, dropping support for Node.js version 8

## v0.5.0

- Added `scope` to task configurations to differentiate 3 things: task type, task source, and where to run tasks
- [core] added implementation for toolbar support for sidepanels and changed sidepanel tabs
- [core] added new keybinding <kbd>alt</kbd>+<kbd>shift</kbd>+<kbd>w</kbd> to close all main area tabs
- [core] added the ability to make sidebar widgets closable
- [core] fixed `ToolbarAwareTabBar` detachment errors
- [core] fixed broken wheel listener
- [core] improved scrollbar styling
- [core] updated tabbar toolbar to use VSCode icons
- [core] updated the UI with numerous improvements including sidepanel icons, better alignment, tabbar and menu size
- [cpp] added new `cpp.clangTidy `and `cpp.clangTidyChecks` preferences to lint cpp program when clangd v9+ is used
- [cpp] fixed properly restarting clangd language server when changing cpp build configurations
- [debug] added new debug preferences to control `view`, `console`, and `location` appearance
- [editorconfig] added support to apply properties to monaco editor when opening/switching editors
- [file-search] improved ordering and consistency of file search results
- [filesystem] added `files.associations` property
- [filesystem] improved the performance when deleting large directories
- [filesystem] upgraded `nsfw` file-watching dependency from `vscode-nsfw` to `Axosoft/nsfw` which fixes memory leaks as well as fixes issues where files are not being properly watched outside the main watched directory
- [git] fixed issue where Theia did not refresh the git view after deleting the only repository
- [git] improved the git diff navigation header to be static
- [java] improved handling of incomplete classpath commands
- [keybindings] improved the keybindings widget search and table header to be static
- [mini-browser] improved error handling of iframe errors
- [navigator] added `Collapse All` toolbar item
- [navigator] updated the navigator to handle multi-root workspaces better
- [plugin-ext] added `workspace.onDidRenameFile ` Plug-in API
- [plugin-ext] added `workspace.onWillRenameFile ` Plug-in API
- [plugin-ext] added `workspace.registerFileSystemProvider` Plug-in API
- [plugin-ext] added `workspace.saveAll` Plug-in API
- [plugin-ext] added `workspace.updateWorkspaceFolders` Plug-in API
- [plugin-ext] added ability to proceed `runInTerminal` requests in sidecar containers
- [plugin-ext] added the ability to get selection context after executing a command
- [plugin-ext] fixed VSCode Plug-in API incompatibilities for the `onDidChangeActiveTextEditor` event
- [plugin-ext] fixed firing the `onWillSaveTextDocument` event
- [plugin-ext] fixed issue of re-deploying already initialized plugins
- [plugin] `workspace.openTextDocument` API now respects the contributed `FileSystemProviders`
- [plugin] added support for multiple windows per backend
- [plugin] fixed progress creation
- [plugin] improved the view container to use the native toolbar
- [preferences] fixed content assist when editing `settings.json`
- [preferences] fixed parsing of settings from workspace files
- [preferences] improved overriding of default configurations
- [preview] fixed issue when opening images
- [search-in-workspace] added a new preference `search.lineNumbers` to control whether to show line numbers for search results
- [task] added ability to `Run Selected Text`
- [task] added new command to re-run the last task
- [task] added schema support for `tasks.json`
- [typehierarchy] added the new type hierarchy extension
- [typehierarchy] improved `typehierarchy` to use all levels the language server sends if available
- [workspace] added new `package.json` properties `newFIleName` and `newFileExtension` to specify default file name and extension when creating a new file
- [workspace] improved performance of the file rename action for large directories

Breaking changes:

- [editor] computation of resource context keys moved to core [#4531](https://github.com/theia-ide/theia/pull/4531)
- [plugin] support multiple windows per a backend [#4509](https://github.com/theia-ide/theia/issues/4509)
  - Some plugin bindings are scoped per a connection now. Clients, who contribute/rebind these bindings, will need to scope them per a connection as well.
- [quick-open] disable separate fuzzy matching by default [#4549](https://github.com/theia-ide/theia/pull/4549)
- [shell] support toolbars in side bars [#4600](https://github.com/theia-ide/theia/pull/4600)
  - In side bars a widget title is rendered as an icon.

## v0.4.0

- [application-manager] added support for pre-load HTML templates
- [console] added support for console `when` contexts
- [core] added support for os `when` contexts
- [core] added support for shell `when` contexts
- [core] added support for vscode closure contexts
- [core] fixed bad vertical resizing behavior
- [core] improved scrollbar visibility for the command palette
- [core] improved tab-bar display (display 'X' (close) on dirty editors when hovering over dirty icon)
- [core] improved tab-bar display (display 'X' (close) only when current editor is active, or has hover)
- [cpp] fixed `CPP_CLANGD_COMMAND` and `CPP_CLANGD_ARGS` environment variables
- [cpp] fixed the update of the active build config statusbar when preferences are updated
- [cpp] implemented the command `Create New Build Configuration`
- [cpp] implemented the command `Reset Build Configuration`
- [cpp] removed duplicate json config entry generated by the command `New Build Config`
- [debug] added support for debug mode `when` contexts
- [editor] added `Clear Editor History` command
- [editor] added support for editor `when` contexts
- [editor] added support for resource `when` contexts
- [editor] registered editor to navigation location stack when `onCurrentEditorChange` event is fired
- [electron] improved opening markdown links by opening them in the OS' default browser
- [electron] stored the last state of window geometry
- [file-search] added separator between recently opened items, and file results when executing the quick file open
- [file-search] added support for ignored globs and limit in file search
- [file-search] improved quick open file sort order
- [file-search] removed git diff editors from displaying the quick file open
- [file-search] added support for `glob` file searches
- [file-search][plugin-ext] updated `exclude` of file search
- [git] added the following git commands: `Stash`, `Apply Stash`, `Apply Latest Stash`, `Pop Stash`, `Pop Latest Stash` and `Drop Stash`
- [git] enhanced `Git Remote` command to obtain complete data
- [git] fixed refreshing the `GitView` when git repo changes
- [git] fixed the command `Git Reset`
- [git] removed bundled git from `dugite`
- [languages] fixed clash in language server session ids
- [messages] added support for notification `when` contexts
- [mini-browser] added ability to pass argument for `openUrl` command
- [monaco] added support for quick open `when` contexts
- [monaco] added support for snipped mode `when` contexts
- [navigator] added support for explorer `when` contexts
- [navigator] fixed updating the navigator context menu on `supportMultiRootWorkspace` preference change
- [plugin-ext-vscode] added ability to handle `vscode.diff` and open diff editor commands
- [plugin-ext-vscode] added vscode `setContext` command
- [plugin-ext-vscode] fixed local resource loading in webviews
- [plugin-ext] fixed `TreeView` widget registration
- [plugin-ext] fixed `onDidSelectItem` behavior for the quick pick widget
- [plugin-ext] fixed command conversions for code lens
- [plugin-ext] fixed issue of `OutputChanel.show` not displaying
- [plugin-ext] fixed miscellaneous issues in golang plugin
- [plugin-ext] implemented `onWillSaveTextDocument` event handler
- [plugin-ext][markers] added support to use problem manager to handle plugin markers
- [plugin] added `tasks.onDidEndTask` Plug-in API
- [plugin] added `tasks.taskExecutions` Plug-in API
- [plugin] added ability to display webview panel in 'left', 'right' and 'bottom' area
- [plugin] added support for `menus.commandPalette` contribution point
- [plugin] added support for `vscode.previewHtml` command
- [plugin] added support for read-only configuration index access
- [plugin] fixed issue of ensuring statusbar entry uniqueness
- [plugin] implemented inspect configuration command
- [plugin] refactored the `Command` interface by splitting into two: `CommandDescription` and `Command`
- [plugin][debug] added ability to connect to a remote debug server
- [preferences] added support for language specific preferences
- [preferences] aligned preference default values by type with vscode
- [search-in-workspace] added support for search `when` contexts
- [search-in-workspace] fixed keybinding for `Search in Workspace` widget
- [terminal] added support for font preferences
- [terminal] added support for terminal `when` contexts
- [vscode] added support for OS specific keybindings
- [vscode] implemented `commands.getCommands`
- [vscode] implemented `commands.registerTextEditorCommand`
- [vscode] implemented `workspace.rootPath`
- [workspace] added support for easier overriding of the `DefaultWorkspaceServer`
- [workspace] added support for workspace `when` contexts
- [workspace] fixed displaying the `Open With...` context menu only when more than one open handler is present
- [mini-browser] improved handling of iframe errors and time-outs

Breaking changes:

- menus aligned with built-in VS Code menus [#4173](https://github.com/theia-ide/theia/pull/4173)
  - navigator context menu group changes:
    - `1_open` and `4_new` replaced by `navigation` group
    - `6_workspace` renamed to `2_workspace` group
    - `5_diff` renamed to `3_compare` group
    - `6_find` renamed to `4_search` group
    - `2_clipboard` renamed to `5_cutcopypaste` group
    - `3_move` and `7_actions` replaced by `navigation` group
  - editor context menu group changes:
    - `2_cut_copy_paste` renamed to `9_cutcopypaste` group
- [debug] align commands with VS Code [#4204](https://github.com/theia-ide/theia/issues/4204)
    - `debug.breakpoint.toggle` renamed to `editor.debug.action.toggleBreakpoint`
    - `debug.start` renamed to `workbench.action.debug.start`
    - `debug.thread.continue` renamed to `workbench.action.debug.continue`
    - `debug.start.noDebug` renamed to `workbench.action.debug.run`
    - `debug.thread.pause` renamed to `workbench.action.debug.pause`
    - `debug.thread.stepin` renamed to `workbench.action.debug.stepInto`
    - `debug.thread.stepout` renamed to `workbench.action.debug.stepOut`
    - `debug.thread.next` renamed to `workbench.action.debug.stepOver`
    - `debug.stop` renamed to `workbench.action.debug.stop`
    - `debug.editor.showHover` renamed to `editor.debug.action.showDebugHover`
- multi-root workspace support for preferences [#3247](https://github.com/theia-ide/theia/pull/3247)
  - `PreferenceProvider`
    - is changed from a regular class to an abstract class
    - the `fireOnDidPreferencesChanged` function is deprecated. `emitPreferencesChangedEvent` function should be used instead. `fireOnDidPreferencesChanged` will be removed with the next major release.
  - `PreferenceServiceImpl`
    - `preferences` is deprecated. `getPreferences` function should be used instead. `preferences` will be removed with the next major release
  - having `properties` property defined in the `PreferenceSchema` object is now mandatory
  - `PreferenceProperty` is renamed to `PreferenceDataProperty`
  - `PreferenceSchemaProvider`
    - the type of `combinedSchema` property is changed from `PreferenceSchema` to `PreferenceDataSchema`
    - the return type of `getCombinedSchema` function is changed from `PreferenceSchema` to `PreferenceDataSchema`
  - `affects` function is added to `PreferenceChangeEvent` and `PreferenceChange` interface
- `navigator.exclude` preference is renamed to `files.exclude` [#4274](https://github.com/theia-ide/theia/pull/4274)

## v0.3.19

- [core] added `hostname` alias
- [core] added new `editor.formatOnSave` preference, to format documents on manual save
- [core] added support for setting end of line character
- [cpp] added new `cpp.clangdExecutable` and `cpp.clangdArgs` to customize language server start command
- [debug] added node debugger as a Plug-in
- [debug] added support for source breakpoints
- [git] added `discardAll` command
- [git] added `stageAll` command
- [git] added `unstageAll` command
- [git] added new `git pull` command, to pull from default configured remote
- [git] added new `git push` command, to push from default configured remote
- [git] added the ability to refresh git repositories when a change is detected within a workspace
- [java] allow the ability to rebind `JavaContribution`
- [languages] enabled INI syntax highlighting for `.properties` and `.toml` files
- [monaco] fixed cross editor navigation
- [monaco] fixed document-saving that took too long
- [monaco] improved `MonacoWorkspace.fireWillSave` performance
- [plugin] added `globalState` and `workspaceState` Plug-in API
- [plugin] added `registerColorProvider` Plug-in API
- [plugin] added `registerRenameProvider` Plug-in API
- [plugin] added `tasks.onDidStartTask` Plug-in API
- [plugin] added basic support of snippets
- [plugin] added common service to handle `when` expressions
- [plugin] added debug Plug-in API
- [plugin] added support for terminal APIs on window
- [plugin] added the ability to debug VS Code extensions
- [plugin] added the ability to get operating system connected to Plug-in
- [plugin] added the ability to provide a way to initialize workspace folders when Theia is started
- [plugin] added the ability to set the visibility of menu items through `when` expressions
- [plugin] added workspace symbols Plug-in API
- [plugin] fixed spreading of command arguments
- [preferences] added the ability to update settings schema resource on schema changes
- [search-in-workspace] fixed issue regarding child root in `search-in-workspace` when there is a multiple-root workspace
- [search-in-workspace] removed duplicates from `search-in-workspace` tree
- [security] updated xterm.js to 3.9.2
- [task] added support to run tasks from multiple-roots
- [task] fixed cwd path
- [workspace] added multiple-root support for `WorkspaceService.getWorkspaceRootUri()`

## v0.3.18

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

## v0.3.17

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

## v0.3.16

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

## v0.3.15

- [cpp] added debugging for C/C++ programs
- [debug] added debug toolbar
- [debug] resolved variables in configurations
- [debug] updated debug session views to act like panels
- [keymaps] added new `View Keybindings Widget` - used to view search and edit keybindings
- [languages] added TCL grammar file
- [plug-in] added `menus` contribution point
- [workspace] added multi-root workspace support with vscode compatibility

## v0.3.13

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

## v0.3.12

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

## v0.3.11

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
