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

```javascript
theia.commands.registerCommand({id:'say.hello.command'}, ()=>{
    console.log("Hello World!");
});
```

Simple example that invoke command:

```javascript
theia.commands.executeCommand('core.about');
```

### window

Common namespace for dealing with window and editor, showing messages and user input.

#### Quick Pick

Function to ask user select some value from the list.

Example of using:

```javascript
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

```javascript
theia.window.showInformationMessage('Information message');
```

Simple example that show an information message with buttons:

```javascript
theia.window.showInformationMessage('Information message', 'Btn1', 'Btn2').then(result => {
    console.log("Click button", result);
});
```

#### Window State API

It is possible to track state of the IDE window inside a plugin. Window state is defined as:

```javascript
interface WindowState {
    readonly focused: boolean;
}
```

To read a state on demand one can use readonly variable:

```javascript
theia.window.state
```

To track window activity subscribe on `onDidChangeWindowState` event:

```javascript
const disposable = theia.window.onDidChangeWindowState((windowState: theia.WindowState) => {
            console.log('Window focus changed: ', windowState.focused);
});
```

#### StatusBar API

 A status bar shows a message to users and supports icon substitution.

 Status bar message can be shown using the [setStatusBarMessage](#window.setStatusBarMessage) and
 [createStatusBarItem](#window.createStatusBarItem) functions.

Simple example that show a status bar message:

```javascript
theia.window.setStatusBarMessage('test status bar item');
```

Simple example that show a status bar message with statusBarItem:

```javascript
  const item = theia.window.createStatusBarItem(theia.StatusBarAlignment.Right, 99);
        item.text = 'test status bar item';
        item.show();
```
