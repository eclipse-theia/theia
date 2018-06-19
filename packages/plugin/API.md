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
