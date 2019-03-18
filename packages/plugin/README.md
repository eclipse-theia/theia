# Introduction

## Theia Plugin system description

### Plugin API

Namespace for dealing with installed plug-ins. Plug-ins are represented
by a Plugin-interface which enables reflection on them.
Plug-in writers can provide APIs to other plug-ins by returning their API public
surface from the `start`-call.

For example some plugin exports it's API:

```javascript
export function start() {
    let api = {
        sum(a, b) {
            return a + b;
        },
        mul(a, b) {
            return a * b;
        }
    };
    // 'export' public api-surface
    return api;
}
```

Another plugin can use that API:

```javascript
let mathExt = theia.plugins.getPlugin('genius.math');
let importedApi = mathExt.exports;
console.log(importedApi.mul(42, 1));
```

Also plugin API allows access to plugin `package.json` content.

Example:

```javascript
const fooPlugin = plugins.getPlugin('publisher.plugin_name');
const fooPluginPackageJson = fooPlugin.packageJSON;
console.log(fooPluginPackageJson.someField);
```

### Command API

 A command is a unique identifier of a function which
 can be executed by a user via a keyboard shortcut, a
 menu action or directly.

Commands can be added using the [registerCommand](#commands.registerCommand) and
[registerTextEditorCommand](#commands.registerTextEditorCommand) functions.
Registration can be split in two step: first register command without handler, second register handler by command id.

Any contributed command are available to any plugin, command can be invoked by [executeCommand](#commands.executeCommand) function.

Simple example that register command:

```typescript
theia.commands.registerCommand({id:'say.hello.command'}, ()=>{
    console.log("Hello World!");
});
```

Simple example that invoke command:

```typescript
theia.commands.executeCommand('core.about');
```

### window

Common namespace for dealing with window and editor, showing messages and user input.

#### Quick Pick

Function to ask user select some value from the list.

Example of using:

```typescript
//configure quick pick options
 const option: theia.QuickPickOptions = {
        machOnDescription: true,
        machOnDetail: true,
        canPickMany: false,
        placeHolder: "Select string:",
        onDidSelectItem: (item) => console.log(`Item ${item} is selected`)
    };
 // call Theia api to show quick pick
theia.window.showQuickPick(["foo", "bar", "foobar"], option).then((val: string[] | undefined) => {
        console.log(`Quick Pick Selected: ${val}`);
    });
```

#### Input Box

Function to ask user for input.

Example of using:

```typescript
const option: theia.InputBoxOptions = {
    prompt:"Hello from Plugin",
    placeHolder:"Type text there",
    ignoreFocusOut: false,
    password: false,
    value:"Default value"
};
theia.window.showInputBox(option).then((s: string | undefined) => {
    console.log(typeof s !== 'undefined'? s : "Input was canceled");
});
```

#### Notification API

 A notification shows an information message to users.
 Optionally provide an array of items which will be presented as clickable buttons.

 Notifications can be shown using the [showInformationMessage](#window.showInformationMessage),
 [showWarningMessage](#window.showWarningMessage) and [showErrorMessage](#window.showErrorMessage) functions.

Simple example that show an information message:

```typescript
theia.window.showInformationMessage('Information message');
```

Simple example that show an information message with buttons:

```typescript
theia.window.showInformationMessage('Information message', 'Btn1', 'Btn2').then(result => {
    console.log("Click button", result);
});
```

#### Window State API

It is possible to track state of the IDE window inside a plugin. Window state is defined as:

```typescript
interface WindowState {
    readonly focused: boolean;
}
```

To read a state on demand one can use readonly variable:

```typescript
theia.window.state
```

To track window activity subscribe on `onDidChangeWindowState` event:

```typescript
const disposable = theia.window.onDidChangeWindowState((windowState: theia.WindowState) => {
    console.log('Window focus changed: ', windowState.focused);
});
```

#### Status Bar API

 A status bar shows a message to users and supports icon substitution.

 Status bar message can be shown using the [setStatusBarMessage](#window.setStatusBarMessage) and
 [createStatusBarItem](#window.createStatusBarItem) functions.

Simple example that show a status bar message:

```typescript
theia.window.setStatusBarMessage('test status bar item');
```

Simple example that show a status bar message with statusBarItem:

```typescript
  const item = theia.window.createStatusBarItem(theia.StatusBarAlignment.Right, 99);
        item.text = 'test status bar item';
        item.show();
```
#### Output channel API

 It is possible to show a container for readonly textual information:

```typescript
   const channel = theia.window.createOutputChannel('test channel');
         channel.appendLine('test output');

```

#### Environment API

Environment API allows reading of environment variables and query parameters of the IDE.

To get an environment variable by name one can use:

```typescript
theia.env.getEnvVariable('NAME_OF_ENV_VARIABLE').then(value => {
    // process the value here
}
```

In case if environment variable doesn't exist `undefined` will be returned.

Also this part of API exposes all query parameters (already URI decoded) with which IDE page is loaded. One can get a query parameter by name:

```typescript
theia.env.getQueryParameter('NAME_OF_QUERY_PARAMETER');
```

In case if query parameter doesn't exist `undefined` will be returned.

Or it is possible to get a map of all query parameters:

```typescript
theia.env.getQueryParameters();
```

Note, that it is possible to have an array of values for single name, because it could be specified more than one time (for example `localhost:3000?foo=bar&foo=baz`).

### Terminal

Function to create new terminal with specific arguments:

```typescript
const terminal = theia.window.createTerminal("Bash terminal", "/bin/bash", ["-l"]);
```

Where are:
 - first argument - terminal's name.
 - second argument - path to the executable shell.
 - third argument - arguments to configure executable shell.

You can create terminal with specific options:

```typescript
const options: theia.TerminalOptions {
    name: "Bash terminal",
    shellPath: "/bin/bash";
    shellArgs: ["-l"];
    cwd: "/projects";
    env: { "TERM": "screen" };
};
```

Where are:
 - "shellPath" - path to the executable shell, for example "/bin/bash", "bash", "sh" or so on.
 - "shellArgs" - shell command arguments, for example without login: "-l". If you defined shell command "/bin/bash" and set up shell arguments "-l" than will be created terminal process with command "/bin/bash -l". And client side will connect to stdin/stdout of this process to interaction with user.
 - "cwd" - current working directory;
 - "env"- environment variables for terminal process, for example TERM - identifier terminal window capabilities.

Function to create new terminal with defined theia.TerminalOptions described above:

```typescript
const terminal = theia.window.createTerminal(options);
```

Created terminal is not attached to the panel. To apply created terminal to the panel use method "show":

```typescript
terminal.show();
```

To hide panel with created terminal use method "hide";

```typescript
terminal.hide();
```

Send text to the terminal:

```typescript
terminal.sendText("Hello, Theia!", false);
```

Where are:
- first argument - text content.
- second argument - in case true, terminal will apply new line after the text, otherwise will send only the text.

Destroy terminal:

```typescript
terminal.dispose();
```

Subscribe to close terminal event:

```typescript
theia.window.onDidCloseTerminal((term) => {
    console.log("Terminal closed.");
});
```

Detect destroying terminal by Id:

```typescript
terminal.processId.then(id => {
    theia.window.onDidCloseTerminal(async (term) => {
        const currentId = await term.processId;
        if (currentId === id) {
            console.log("Terminal closed.", id);
        }
    }, id);
});
```

#### Preference API

Preference API allows one to read or update User's and Workspace's preferences.

To get preferences:
```typescript
// editor preferences
const preferences = theia.workspace.getConfiguration('editor');

// retrieving values
const fontSize = preferences.get('tabSize');
```

To change preference:
```typescript
preferences.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('editor.tabSize')) {
        console.log('Property "editor.tabSize" is changed');
    }
});

preferences.update('tabSize', 2);
```

### Languages API

#### Diagnostics

To get all existing diagnostics one should use `getDiagnostics` call. If diagnostics are needed for specific URI they could be obtain with following call:

```typescript
const diagnostics = theia.languages.getDiagnostics(uriToResource)
```

To get all diagnostics use:
```typescript
const diagnostics =  theia.languages.getDiagnostics()
```

For example, following code will get diagnostics for current file in the editor (supposed one is already opened):

```typescript
const diagnosticsForCurrentFile = theia.languages.getDiagnostics(theia.window.activeTextEditor.document.uri)
```

If no diagnostics found empty array will be returned.

Note, that returned array from `getDiagnostics` call are readonly.

To tracks changes in diagnostics `onDidChangeDiagnostics` event should be used. Within event handler list of uris with changed diagnostics is available. Example:

```typescript
disposables.push(
    theia.languages.onDidChangeDiagnostics((event: theia.DiagnosticChangeEvent) => {
        // handler code here
    }
);
```

Also it is possible to add own diagnostics. To do this, one should create diagnostics collection first:

```typescript
const diagnosticsCollection = theia.languages.createDiagnosticCollection(collectionName);
```

Collection name can be omitted. In such case the name will be auto-generated.

When collection is created, one could operate with diagnostics. The collection object exposes all needed methods: `get`, `set`, `has`, `delete`, `clear`, `forEach` and `dispose`.

`get`, `has` and `delete` performs corresponding operation by given resource uri. `clear` removes all diagnostics for all uris in the collection.

Behavior of `set` is more complicated. To replace all diagnostics for given uri the following call should be used:

```typescript
diagnosticsCollection.set(uri, newDiagnostics)
```

if `undefined` is passed instead of diagnostics array the call will clear diagnostics for given uri in this collection (the same as `delete`).
Also it is possible to set all diagnostics at once (it will replace existed ones). To do this, array of tuples in format `[uri, diagnostics]` should be passed as argument for `set`:

```typescript
const changes: [Uri, Diagnostic[] | undefined][] = [];

changes.push([uri1, diagnostics1]);
changes.push([uri2, diagnostics2]);
changes.push([uri3, undefined]);
changes.push([uri1, diagnostics4]); // uri1 again

diagnosticsCollection.set(changes);
```

If the same uri is used a few times, corresponding diagnostics will be merged. In case of `undefined` all previous, but not following, diagnostics will be cleared. If `undefined` is given instead of tuples array the whole collection will be cleared.

To iterate over all diagnostics within the collection `forEach` method could be used:

```typescript
diagnosticsCollection.forEach((uri, diagnostics) => {
    // code here
}
```

`dispose` method should be used when the collection is not needed any more. In case of attempt to do an operation after disposing an error will be thrown.

#### Signature help

To provide signature help form plugin it is required to register provider. For registration 3 items are needed:
- Documents selector to describe for which files it should be applied
- Handler which will do the work
- Trigger characters after typing of which the handler should be invoked. Often symbols `(` and `,` are used.

Example of signature help provider registration:

```typescript
const documentsSelector: theia.DocumentSelector = { scheme: 'file', language: 'typescript' };
const handler = { provideSignatureHelp: signatureHelpHandler };
const triggerChars = '(,';

const disposable = theia.languages.registerSignatureHelpProvider(documentsSelector, handler, ...triggerChars);

...

function signatureHelpHandler(document: theia.TextDocument, position: theia.Position): theia.ProviderResult<theia.SignatureHelp> {
    // code here
}
```

Example of signature information:

```typescript
{
    activeSignature: 0,
    activeParameter: 0,
    signatures: [
        {
            label: 'functionName(param1: number, param2: string, param3: boolean)',
            documentation: new theia.MarkdownString('What **this** function does'),
            parameters: [
                {
                    label: 'param1: number',
                    documentation: new theia.MarkdownString('Some number. Should not be `undefined`')
                },
                {
                    label: 'param2: string',
                    documentation: 'Some string'
                },
                {
                    label: 'param3: boolean',
                    documentation: 'Some flag'
                }
            ]
        }
    ]
}
```

Note, that:
- `activeSignature` and `activeParameter` are zero based.
- label is usually full method signature.
- for documentation fields markdown partially supported (Tags aren't supported).
- label of a parameter should be substring of the signature label. In such case the substring will be highlighted in main label when parameter is active. Otherwise has no effect.

When signature help popup is shown then the handler will be invoked on each parameter edit or even cursor moving inside signature. If you have large objects it would be wise to cache them of at least reuse some parts.

To hide your popup just return `undefined` from provider.

In case if a few providers are registered the chain will be executed until one of the providers returns result. Next providers will be ignored for the call.

#### Hover Message

To contribute a hover it is only needed to provide a function that can be called with a `TextDocument` and a `Position` returning hover info. Registration is done using a document selector which either a language id ('typescript', 'javascript' etc.) or a more complex filter like `{scheme: 'file', language: 'typescript'}`.

For example,
```typescript
theia.languages.registerHoverProvider('typescript', {
    provideHover(doc: theia.TextDocument, position: theia.Position) {
        return new theia.Hover('Hover for all **typescript** files.');
    }
});
```
will show the hover message for all `typescript` files.

The code below puts word under cursor into hover message:
```typescript
theia.languages.registerHoverProvider({scheme: 'file'}, {
    provideHover(doc: theia.TextDocument, position: theia.Position) {
        const range = doc.getWordRangeAtPosition(position);
        const text = doc.getText(range);
        return new theia.Hover(text);
    }
});
```

#### Document Highlight provider

It is possible to provide document highlight source for a symbol from within plugin.
To do this one should register corresponding provider. For example:

```typescript
const documentsSelector: theia.DocumentSelector = { scheme: 'file', language: 'typescript' };
const handler: theia.DocumentHighlightProvider = { provideDocumentHighlights: provideDocumentHighlightsHandler };

const disposable = theia.languages.registerDocumentHighlightProvider(documentsSelector, handler);

...

function provideDocumentHighlightsHandler(document: theia.TextDocument, position: theia.Position): theia.ProviderResult<theia.DocumentHighlight[]> {
    // code here
}
```

It is possible to return a few sources, but for most cases only one is enough. Return `undefined` to provide nothing.

#### Definition provider

It is possible to provide definition source for a symbol from within plugin.
To do this one should register corresponding provider. For example:

```typescript
const documentsSelector: theia.DocumentSelector = { scheme: 'file', language: 'typescript' };
const handler: theia.DefinitionProvider = { provideDefinition: provideDefinitionHandler };

const disposable = theia.languages.registerDefinitionProvider(documentsSelector, handler);

...

function provideDefinitionHandler(document: theia.TextDocument, position: theia.Position): theia.ProviderResult<theia.Definition | theia.DefinitionLink[]> {
    // code here
}
```

The handler will be invoked each time when a user executes `Go To Definition` command.
It is possible to return a few sources, but for most cases only one is enough. Return `undefined` to provide nothing.

#### Implementation provider

It is possible to provide implementation source for a symbol from within plugin.
To do this one should register corresponding provider. For example:

```typescript
const documentsSelector: theia.DocumentSelector = { scheme: 'file', language: 'typescript' };
const handler: theia.ImplementationProvider = { provideImplementation: provideImplementationHandler };

const disposable = theia.languages.registerImplementationProvider(documentsSelector, handler);

...

function provideImplementationHandler(document: theia.TextDocument, position: theia.Position): theia.ProviderResult<theia.Definition | theia.DefinitionLink[]> {
    // code here
}
```

It is possible to return a few sources, but for most cases only one is enough. Return `undefined` to provide nothing.

#### Type Definition provider

It is possible to provide type definition source for a symbol from within plugin.
To do this one should register corresponding provider. For example:

```typescript
const documentsSelector: theia.DocumentSelector = { scheme: 'file', language: 'typescript' };
const handler: theia.TypeDefinitionProvider = { provideTypeDefinition: provideTypeDefinitionHandler };

const disposable = theia.languages.registerTypeDefinitionProvider(documentsSelector, handler);

...

function provideTypeDefinitionHandler(document: theia.TextDocument, position: theia.Position): theia.ProviderResult<theia.Definition | theia.DefinitionLink[]> {
    // code here
}
```

The handler will be invoked each time when a user executes `Go To Type Definition` command.
It is possible to return a few sources, but for most cases only one is enough. Return `undefined` to provide nothing.

#### Reference provider

It is possible to provide reference sources for a symbol from within plugin.
To do this one should register corresponding provider. For example:

```typescript
const documentsSelector: theia.DocumentSelector = { scheme: 'file', language: 'typescript' };
const handler: theia.ReferenceProvider = { provideReferences: provideReferencesHandler };

const disposable = theia.languages.registerReferenceProvider(documentsSelector, handler);

...

function provideReferencesHandler(document: theia.TextDocument, position: theia.Position, context: theia.ReferenceContext): theia.ProviderResult<theia.Location[]> {
    // code here
}
```

The handler will be invoked each time when a user executes `Find All References` command.
It is possible to return a few sources. Return `undefined` to provide nothing.

#### Document Link Provider

A document link provider allows to add a custom link detection logic.

Example of document link provider registration:

```typescript
const documentsSelector: theia.DocumentSelector = { scheme: 'file', language: 'typescript' };
const provider = { provideDocumentLinks: provideLinks };

const disposable = theia.languages.registerDocumentLinkProvider(documentsSelector, provider);

...

function provideLinks(document: theia.TextDocument): theia.ProviderResult<theia.DocumentLink[]> {
    // code here
}
```

#### Code Lens Provider

A code lens provider allows to add a custom lens detection logic.

Example of code lens provider registration:

```typescript
const documentsSelector: theia.DocumentSelector = { scheme: 'file', language: 'typescript' };
const provider = { provideCodeLenses: provideLenses };

const disposable = theia.languages.registerCodeLensProvider(documentsSelector, provider);

...

function provideLenses(document: theia.TextDocument): theia.ProviderResult<theia.CodeLens[]> {
    // code here
}
```

#### Code Symbol Provider

A document symbol provider allows to add a custom logic for symbols detection.

Example of code symbol provider registration:

```typescript
const documentsSelector: theia.DocumentSelector = { scheme: 'file', language: 'typescript' };
const provider = { provideDocumentSymbols: provideSymbols };

const disposable = theia.languages.registerDocumentSymbolProvider(documentsSelector, provider);

...

function provideSymbols(document: theia.TextDocument): theia.ProviderResult<theia.SymbolInformation[] | theia.DocumentSymbol[]> {
    // code here
}
```

#### Workspace Symbol Provider

A workspace symbol provider allows you register symbols for the symbol search feature.

resolveWorkspaceSymbol is not needed if all SymbolInformation's returned from
provideWorkspaceSymbols have a location. Otherwise resolveWorkspaceSymbol is needed
in order to resolve the location of the SymbolInformation.

Example of workspace symbol provider registration:

```typescript
theia.languages.registerWorkspaceSymbolProvider({
    provideWorkspaceSymbols(query: string): theia.SymbolInformation[] {
        return [new theia.SymbolInformation('my symbol', 4, new theia.Range(new theia.Position(0, 0), new theia.Position(0, 0)), theia.Uri.parse("some_uri_to_file"))];
    }
} as theia.WorkspaceSymbolProvider);
```

In this case resolveWorkspaceSymbol is not needed because we have provided the location for every
symbol returned from provideWorkspaceSymbols

```typescript
theia.languages.registerWorkspaceSymbolProvider({
    provideWorkspaceSymbols(query: string): theia.SymbolInformation[] {
        return [new theia.SymbolInformation('my symbol', 4, 'my container name', new theia.Location(theia.Uri.parse("some_uri_to_file"), undefined))];
    },
    resolveWorkspaceSymbol(symbolInformation: theia.SymbolInformation): theia.SymbolInformation {
        symbolInformation.location.range = new theia.Range(new theia.Position(0, 0), new theia.Position(0, 0));
        return symbolInformation;
    }
} as theia.WorkspaceSymbolProvider);
```

resolveWorkspaceSymbol is needed here because we have not provided the location for every
symbol return from provideWorkspaceSymbol

#### Folding

A folding range provider allows you to add logic to fold and unfold custom regions of source code.

Example of folding range provider registration:

```typescript
const documentsSelector: theia.DocumentSelector = { scheme: 'file', language: 'typescript' };
const provider = { provideFoldingRanges: provideRanges };

const disposable = theia.languages.registerFoldingRangeProvider(documentsSelector, provider);

...

function provideRanges(document: theia.TextDocument): theia.ProviderResult<theia.FoldingRange[]> {
    // code here
}
```

## License
- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)
