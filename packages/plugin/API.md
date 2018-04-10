# Introduction
## Theia Plugin system description

### Command API
 A command is a unique identifier of a function which 
 can be executed by a user via a keyboard shortcut, a
 menu action or directly.

Commands can be added using the [registerCommand](#commands.registerCommand) and
[registerTextEditorCommand](#commands.registerTextEditorCommand) functions.
Registration can be split in two step: first register command without handler, 
second register handler by command id.

Any contributed command are available to any plugin, command can be invoked 
by [executeCommand](#commands.executeCommand) function.

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
