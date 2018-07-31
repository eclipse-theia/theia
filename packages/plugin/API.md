# Introduction

## Theia Plugin system description

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
const terminal = theia.window.createTerminal("Bash terminal", "/bin/bash", shellArgs: ["-l"]);
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
 - "env"- enviroment variables for terminal process, for example TERM - identifier terminal window capabilities.

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

Distroy terminal:

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
