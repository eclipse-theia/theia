# Theia - Variable Resolver Extension

The extension provides variable substitution mechanism inside of strings using `${variableName}` syntax.

## Variable Contribution Point
Extension provides a hook that allows any extensions to contribute its own variables.
Here's the example of contributing two variables:
- `${file}` - returns the name of the file opened in the current editor
- `${lineNumber}` - returns the current line number in the current file

```typescript
@injectable()
export class EditorVariableContribution implements VariableContribution {

    constructor(
        @inject(EditorManager) protected readonly editorManager: EditorManager
    ) { }

    registerVariables(variables: VariableRegistry): void {
        variables.registerVariable({
            name: 'file',
            description: 'The name of the file opened in the current editor',
            resolve: () => {
                const currentEditor = this.getCurrentEditor();
                if (currentEditor) {
                    return currentEditor.uri.displayName;
                }
                return undefined;
            }
        });
        variables.registerVariable({
            name: 'lineNumber',
            description: 'The current line number in the current file',
            resolve: () => {
                const currentEditor = this.getCurrentEditor();
                if (currentEditor) {
                    return `${currentEditor.cursor.line + 1}`;
                }
                return undefined;
            }
        });
    }

    protected getCurrentEditor(): TextEditor | undefined {
        const currentEditor = this.editorManager.currentEditor;
        if (currentEditor) {
            return currentEditor.editor;
        }
        return undefined;
    }
}
```

Note that a Variable is resolved to `MaybePromise<string | undefined>` which means that it can be resolved synchronously or within a Promise.

## Using the Variable Resolver Service

There's the example of how one can use Variable Resolver Service in its own plugin:
```typescript
@injectable()
export class MyService {

    constructor(
        @inject(VariableResolverService) protected readonly variableResolver: VariableResolverService
    ) { }

    async resolve(): Promise<void> {
        const text = 'cursor is in file ${file} on line ${lineNumber}';
        const resolved = await this.variableResolver.resolve(text);
        console.log(resolved);
    }
}
```

If `package.json` file is currently opened and cursor is on line 5 then the following output will be logged to the console:
```
cursor is in file package.json on line 5
```

## License
- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)
