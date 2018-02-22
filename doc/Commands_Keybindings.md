Theia can be extended in a number of different ways. Commands allow packages to contribute unique commands that can then be called by other packages. It's also possible to add keybindings and contexts to these commands, so that they can only be called under certain conditions (window focus, current selection etc.).

## Adding commands to Theia command registry

To contribute commands to the command registry, modules must implement the `CommandContribution` class, i.e 

**java-commands.ts**
```typescript
@injectable()
export class JavaCommandContribution implements CommandContribution {
...
    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SHOW_JAVA_REFERENCES, {
            execute: (uri: string, position: Position, locations: Location[]) =>
                commands.executeCommand(SHOW_REFERENCES.id, uri, position, locations)
        });
        commands.registerCommand(APPLY_WORKSPACE_EDIT, {
            execute: (changes: WorkspaceEdit) =>
                !!this.workspace.applyEdit && this.workspace.applyEdit(changes)
        });
    }
}
```

Each contribution needs a unique command id and a command handler (the callback that will be executed).

### Binding the contribution to CommandContribution

The contributing class should then be injected into the appropriate module (make sure the class is tagged @injectable() first) like so

**java-frontend-module.ts**
```typescript
export default new ContainerModule(bind => {
    bind(CommandContribution).to(JavaCommandContribution).inSingletonScope();
    ...
});
```


The class that is in charge of registering and executing the commands is the command registry. It is also possible to get the list of commands with the `get commandIds()` api.

## Adding keybindings to the keybinding registry

Commands don't need keybindings by default, as they can be called by a lot of other means (programmatically, user clicks etc.). However, keybindings with specific contexts can be added to a command in a similar way to contributing commands.

To contribute a keybinding, simply inject an implementation of `KeybindingContribution`.

**editor-keybinding.ts**
```typescript
@injectable()
export class EditorKeybindingContribution implements KeybindingContribution {

    constructor(
        @inject(EditorKeybindingContext) protected readonly editorKeybindingContext: EditorKeybindingContext
    ) { }

    registerKeybindings(registry: KeybindingRegistry): void {
        [
            {
                command: 'editor.close',
                context: this.editorKeybindingContext,
                keybinding: "alt+w"
            },
            {
                command: 'editor.close.all',
                context: this.editorKeybindingContext,
                keybinding: "alt+shift+w"
            }
        ].forEach(binding => {
            registry.registerKeybinding(binding);
        });
    }
}
```

The `commandId` must be a unique command that was registered beforehand, the `context` is a simple class that makes sure the command/keybinding combination is enabled for the certain conditions. In the case of the editor, it looks like this

**editor-keybinding.ts**
```typescript
@injectable()
export class EditorKeybindingContext implements KeybindingContext {
    constructor( @inject(EditorManager) protected readonly editorService: EditorManager) { }

    id = 'editor.keybinding.context';

    isEnabled(arg?: Keybinding) {
        return this.editorService && !!this.editorService.activeEditor;
    }
}
```

The context also has a unique id, which can then be used to register several keybindings to commands within that context. The `isEnabled()` method is where the context is evaluated to true or false for given conditions. Note that the context is an optional parameter that, when not provided, defaults to the `NOOP_CONTEXT`. Keybindings registered using this context will always have an enabled context, thus making them work anywhere in the application.

With the `id`, the only other mandatory parameter is the `keycode`, which is basically a structure containing the actual keybindings. Here is the corresponding structure

**keys.ts**
```typescript
export declare type Keystroke = { first: Key, modifiers?: KeyModifier[] };
```
Modifiers are platform independent, so `KeyModifier.CtrlCmd` is Command on OS X and CTRL on Windows/Linux. Key string constants are defined in `keys.ts`

### Binding the contribution to KeybindingContribution

Just like you need to bind the command contributions, keybinding contributions also need to be bound per module like so

**editor-frontend-module.ts**
```typescript
export default new ContainerModule(bind => {
    ...
    bind(CommandContribution).to(EditorCommandHandlers);
    bind(EditorKeybindingContext).toSelf().inSingletonScope();
    bind(KeybindingContext).toDynamicValue(context => context.container.get(EditorKeybindingContext));
    bind(KeybindingContribution).to(EditorKeybindingContribution);
});

```
