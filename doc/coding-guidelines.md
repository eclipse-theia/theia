# Coding Guidelines

## Indentation
Use 4 spaces per indentation level.

## Imports
Use `organize imports` to sort imports, and make sure the imports work properly (e.g. imports from `/src/` rather than `/lib/` for *.ts files may break builds).

## Names
<a name="pascalcase-type"></a>
* [1.](#pascalcase-type) Use PascalCase for `type` names.
<a name="pascalcase-enum"></a>
* [2.](#pascalcase-enum) Use PascalCase for `enum` values.
<a name="camelcase-fn"></a>
* [3.](#camelcase-fn)  Use camelCase for `function` and `method` names.
<a name="camelcase-var"></a>
* [4.](#camelcase-var)  Use camelCase for `property` names and `local variables`.
<a name="whole-words-names"></a>
* [5.](#whole-words-names) Use whole words in names when possible.
<a name="lower-case-names"></a>
```ts
// bad
const termWdgId = 1;

// good
const terminalWidgetId = 1;
```
* [6.](#lower-case-names) Use lower-case, dash-separated file names (e.g. `document-provider.ts`).
<a name="file-name"></a>
* [7.](#file-name) Name files after the main type it exports.
> Why? It should be easy to find a type by a file name.
<a name="one-large-class-per-file"></a>
* [7.1](#one-large-class-per-file) Avoid one file with many large classes; put each class in its own file.
> Why? It should be easy to find a class by a file name.
<a name="unique-names"></a>
* [8.](#unique-names) Give unique names to types and files. Use specific names to achieve it.
> Why? In order to avoid duplicate records in file and type search.
```ts
// bad
export interface TitleButton {}

// good
export interface QuickInputTitleButton {}
```
<a name="no_underscore_private"></a>
* [9.](#no_underscore_private) Do not use "_" as a prefix for private properties. Exceptions:
<a name="underscore_accessors"></a>
  * [9.1](#underscore_accessors) Exposing a property through get/set and using underscore for the internal field.
<a name="underscore_json"></a>
  * [9.2](#underscore_json) Attaching internal data to user-visible JSON objects.
<a name="event_names"></a>
* [10.](#event_names) Names of events follow the `on[Will|Did]VerbNoun?` pattern. The name signals if the event is going to happen (onWill) or already happened (onDid), what happened (verb), and the context (noun) unless obvious from the context.
<a name="unique-context-keys"></a>
* [11.](#unique-context-keys) Give unique names to keybinding contexts and keys to avoid collisions at runtime. Use specific names to achieve it.
```ts
// bad
export namespace TerminalSearchKeybindingContext {
    export const disableSearch = 'hideSearch';
}

// good
export namespace TerminalSearchKeybindingContext {
    export const disableSearch = 'terminalHideSearch';
}

// bad
const terminalFocusKey = this.contextKeyService.createKey<boolean>('focus', false);

// good
const terminalFocusKey = this.contextKeyService.createKey<boolean>('terminalFocus', false);
```

## Types
<a name="no-expose-types"></a>
* [1.](#no-expose-types) Do not export `types` or `functions` unless you need to share it across multiple components, [see as well](#di-function-export).
<a name="no-global-types"></a>
* [2.](#no-global-types) Do not introduce new `types` or `values` to the global namespace.
<a name="explicit-return-type"></a>
* [3.](#explicit-return-type) Always declare a return type in order to avoid accidental breaking changes because of changes to a method body.

## Interfaces/Symbols

<a name="interfaces-no-i-prefix"></a>
* [1.](#interfaces-no-i-prefix) Do not use `I` prefix for interfaces. Use `Impl` suffix for implementation of interfaces with the same name. See [624](https://github.com/theia-ide/theia/issues/624) for the discussion on this.
<a name="classes-over-interfaces"></a>
* [2.](#classes-over-interfaces) Use classes instead of interfaces + symbols when possible to avoid boilerplate.

```ts
// bad
export const TaskDefinitionRegistry = Symbol('TaskDefinitionRegistry');
export interface TaskDefinitionRegistry {
    register(definition: TaskDefinition): void;
}
export class TaskDefinitionRegistryImpl implements TaskDefinitionRegistry {
    register(definition: TaskDefinition): void {
    }
}
bind(TaskDefinitionRegistryImpl).toSelf().inSingletonScope();
bind(TaskDefinitionRegistry).toService(TaskDefinitionRegistryImpl);

// good
export class TaskDefinitionRegistry {
    register(definition: TaskDefinition): void {
    }
}
bind(TaskDefinitionRegistry).toSelf().inSingletonScope();
```

**Exceptions**
<a name="remote-interfaces"></a>
* [2.1](#remote-interfaces) Remote services should be declared as an interface + a symbol in order to be used in the frontend and backend.

## Comments
* Use JSDoc style comments for `functions`, `interfaces`, `enums`, and `classes`

## Strings
* Use 'single quotes' for all strings that aren't [template literals](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals)

## null and undefined
Use `undefined`; do not use `null`.

## Internationalization/Localization

<a name="nls-localize"></a>
* [1.](#nls-localize) Always localize user-facing text with the `nls.localize(key, defaultValue, ...args)` function.

> What is user-facing text? Any strings that are hard-coded (not calculated) that could be in any way visible to the user, be it labels for commands and menus, messages/notifications/dialogs, quick-input placeholders or preferences.

<a name="nls-localize-args"></a>
* [1.1.](#nls-localize-args) Parameters for messages should be passed as the `args` of the `localize` function. They are inserted at the location of the placeholders - in the form of `{\d+}` - in the localized text. E.g. `{0}` will be replaced with the first `arg`, `{1}` with the second, etc.

```ts
// bad
nls.localize('hello', `Hello there ${name}.`);

// good
nls.localize('hello', 'Hello there {0}.', name);
```

<a name="nls-localize-by-default"></a>
* [1.2.](#nls-localize-by-default) The `nls.localizeByDefault` function automatically finds the translation key for VS Code's language packs just by using the default value as its argument and translates it into the currently used locale. If the `nls.localizeByDefault` function is not able to find a key for the supplied default value, a warning will be shown in the browser console. If there is no appropriate translation in VSCode, just use the `nls.localize` function with a new key using the syntax `theia/<package>/<id>`.

```ts
// bad
nls.localize('vscode/dialogService/close', 'Close');

// good
nls.localizeByDefault('Close');
```

<a name="nls-utilities"></a>
* [2.](#nls-utilities) Use utility functions where possible:
```ts
// bad
command: Command = { label: nls.localize(key, defaultValue), originalLabel: defaultValue };

// good
command = Command.toLocalizedCommand({ id: key, label: defaultValue });
```

## Style
* Use arrow functions `=>` over anonymous function expressions.
* Only surround arrow function parameters when necessary. For example, `(x) => x + x` is wrong, but the following are correct:

```javascript
x => x + x
(x,y) => x + y
<T>(x: T, y: T) => x === y
```

* Always surround loop and conditional bodies with curly braces.
* Open curly braces always go on the same line as whatever necessitates them.
* Parenthesized constructs should have no surrounding whitespace. A single space follows commas, colons, and semicolons in those constructs. For example:

```javascript
for (var i = 0, n = str.length; i < 10; i++) { }
if (x < 10) { }
function f(x: number, y: string): void { }
```
 * Use a single declaration per variable statement <br />(i.e. use `var x = 1; var y = 2;` over `var x = 1, y = 2;`).
 * `else` goes on the line of the closing curly brace.

## Dependency Injection
<a name="property-injection"></a>
* [1.](#property-injection) Use property injection over construction injection. Adding new dependencies via the construction injection is a breaking change.
<a name="post-construct"></a>
* [2.](#post-construct) Use a method decorated with `postConstruct` rather than the constructor to initialize an object, for example to register event listeners.

```ts
@injectable()
export class MyComponent {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @postConstruct()
    protected init(): void {
        this.shell.activeChanged.connect(() => this.doSomething());
    }

}
```
<a name="singleton-scope"></a>
* [3.](#singleton-scope) Make sure to add `inSingletonScope` for singleton instances, otherwise a new instance will be created on each injection request.

```ts
// bad
bind(CommandContribution).to(LoggerFrontendContribution);

// good
bind(CommandContribution).to(LoggerFrontendContribution).inSingletonScope();
```
<a name="di-function-export"></a>
* [4.](#di-function-export) Don't export functions, convert them into class methods. Functions cannot be overridden to change their behavior or work around a bug.

```ts
// bad
export function createWebSocket(url: string): WebSocket {
   ...
}

// good
@injectable()
export class WebSocketProvider {
   protected createWebSocket(url: string): WebSocket {
       ...
   }
}

@injectable()
export class MyWebSocketProvider extends WebSocketProvider {
   protected createWebSocket(url: string): WebSocket {
      // create a web socket with custom options
   }
}
```

**Exceptions**
<a name="di-convenient-function-export"></a>
* [4.1](#di-convenient-function-export) Convenient functions which are based on the stable API can be exported in the corresponding namespace.

In this case clients:
   - can customize behaviour via exchanging the API implementation
   - have a choice to use convenient functions or an API directly
```ts
export namespace MonacoEditor {
    // convenient function to get a Monaco editor based on the editor manager API
    export function getCurrent(manager: EditorManager): MonacoEditor | undefined {
        return get(manager.currentEditor);
    }
    ...
}
```
<a name="di-json-function-export"></a>
* [4.2](#di-json-function-export) The special case of [4.1](#di-convenient-function-export) is functions on a JSON type.

JSON types are not supposed to be *implementable*, but only *instantiable*. They cannot have functions to avoid serialization issues.
```ts
export interface CompositeTreeNode extends TreeNode {
    children: ReadonlyArray<TreeNode>;

    // bad - JSON types should not have functions
    getFirstChild(): TreeNode | undefined;
}

// good - JSON types can have corresponding namespaces with functions
export namespace CompositeTreeNode {
    export function getFirstChild(parent: CompositeTreeNode): TreeNode | undefined {
        return parent.children[0];
    }
    ...
}

// bad - JSON types should not be implemented
export class MyCompositeTreeNode implements CompositeTreeNode {
    ...
}

// good - JSON types can be extended
export interface MyCompositeTreeNode extends CompositeTreeNode {
    ...
}
```
<a name="di-auxiliary-function-export"></a>
* [4.3](#di-auxiliary-function-export) Auxiliary functions which are called from the customizable context can be exported in the corresponding namespace.

```ts
@injectable()
export class DirtyDiffModel {
    // This method can be overridden. Subclasses have access to `DirtyDiffModel.documentContentLines`.
    protected handleDocumentChanged(document: TextEditorDocument): void {
        this.currentContent = DirtyDiffModel.documentContentLines(document);
        this.update();
    }
}
export namespace DirtyDiffModel {
    // the auxiliary function
    export function documentContentLines(document: TextEditorDocument): ContentLines {
        ...
    }
}
```
<a name="no-multi-inject"></a>
* [5.](#no-multi-inject) Don't use InversifyJS's `@multiInject`, use Theia's utility `ContributionProvider` to inject multiple instances.
> Why?
> - `ContributionProvider` is a documented way to introduce contribution points. See `Contribution-Points`: https://www.theia-ide.org/docs/services_and_contributions
> - If nothing is bound to an identifier, multi-inject resolves to `undefined`, not an empty array. `ContributionProvider` provides an empty array.
> - Multi-inject does not guarantee the same instances are injected if an extender does not use `inSingletonScope`. `ContributionProvider` caches instances to ensure uniqueness.
> - `ContributionProvider` supports filtering. See `ContributionFilterRegistry`.


## CSS
<a name="css-use-lower-case-with-dashes"></a>
* [1.](#css-use-lower-case-with-dashes) Use the `lower-case-with-dashes` format.
<a name="css-prefix-global-classes"></a>
* [2.](#css-prefix-global-classes) Prefix classes with `theia` when used as global classes.
<a name="no-styles-in-code"></a>
* [3.](#no-styles-in-code) Do not define styles in code. Introduce proper CSS classes.
> Why? It is not possible to play with such styles in the dev tools without recompiling the code. CSS classes can be edited in the dev tools.

## Theming
<a name="theming-no-css-color-variables"></a>
* [1.](#theming-no-css-color-variables) Do not introduce CSS color variables. Implement `ColorContribution` and use `ColorRegistry.register` to register new colors.
<a name="theming-no-css-color-values"></a>
* [2.](#theming-no-css-color-values) Do not introduce hard-coded color values in CSS. Instead, refer to [VS Code colors](https://code.visualstudio.com/api/references/theme-color) in CSS by prefixing them with `--theia` and replacing all dots with dashes. For example `widget.shadow` color can be referred to in CSS with `var(--theia-widget-shadow)`.
<a name="theming-derive-colors-from-vscode"></a>
* [3.](#theming-derive-colors-from-vscode) Always derive new colors from existing [VS Code colors](https://code.visualstudio.com/api/references/theme-color). New colors can be derived from an existing color by plain reference, e.g. `dark: 'widget.shadow'`, or transformation, e.g. `dark: Color.lighten('widget.shadow', 0.4)`.
> Why? Otherwise, there is no guarantee that new colors will fit well into new VSCode color themes.
<a name="theming-theia-colors"></a>
* [4.](#theming-theia-colors) Apply different color values only in concrete Theia themes, see [Light (Theia)](https://github.com/eclipse-theia/theia/blob/master/packages/monaco/data/monaco-themes/vscode/light_theia.json), [Dark (Theia)](https://github.com/eclipse-theia/theia/blob/master/packages/monaco/data/monaco-themes/vscode/dark_theia.json) and [High Contrast (Theia)](https://github.com/eclipse-theia/theia/blob/master/packages/monaco/data/monaco-themes/vscode/hc_theia.json) themes.
<a name="theming-variable-naming"></a>
* [5.](#theming-variable-naming) Names of variable follow the `object.property` pattern.
```ts
// bad
'button.secondary.foreground'
'button.secondary.disabled.foreground'

// good
'secondaryButton.foreground'
'secondaryButton.disabledForeground'
```

## React
<a name="no-bind-fn-in-event-handlers"></a>
* [1.](#no-bind-fn-in-event-handlers) Do not bind functions in event handlers.
  - Extract a React component if you want to pass state to an event handler function.

> Why? Because doing so creates a new instance of the event handler function on each render and breaks React element caching leading to re-rendering and bad performance.

```ts
// bad
class MyWidget extends ReactWidget {
  render(): React.ReactNode {
    return <div onClick={this.onClickDiv.bind(this)} />;
  }

  protected onClickDiv(): void {
    // do stuff
  }
}

// bad
class MyWidget extends ReactWidget {
  render(): React.ReactNode {
    return <div onClick={() => this.onClickDiv()} />;
  }

  protected onClickDiv(): void {
    // do stuff
  }
}

// very bad
class MyWidget extends ReactWidget {
  render(): React.ReactNode {
    return <div onClick={this.onClickDiv} />;
  }

  protected onClickDiv(): void {
    // do stuff, no `this` access
  }
}

// good
class MyWidget extends ReactWidget {
  render(): React.ReactNode {
    return <div onClick={this.onClickDiv} />
  }

  protected onClickDiv = () => {
    // do stuff, can access `this`
  }
}
```

## URI/Path
<a name="uri-over-path"></a>
* [1.](#uri-over-path) Pass URIs between frontend and backend, never paths. URIs should be sent as strings in JSON-RPC services, e.g. `RemoteFileSystemServer` accepts strings, not URIs.
> Why? Frontend and backend can have different operating systems leading to incompatibilities between paths. URIs are normalized in order to be OS-agnostic.
<a name="frontend-fs-path"></a>
* [2.](#frontend-fs-path) Use `FileService.fsPath` to get a path on the frontend from a URI.
<a name="backend-fs-path"></a>
* [3.](#backend-fs-path) Use `FileUri.fsPath` to get a path on the backend from a URI. Never use it on the frontend.
<a name="uri-scheme"></a>
* [4.](#explicit-uri-scheme) Always define an explicit scheme for a URI.
> Why? A URI without scheme will fall back to `file` scheme for now; in the future it will lead to a runtime error.
<a name="frontend-path"></a>
* [5.](#frontend-path) Use `Path` Theia API to manipulate paths on the frontend. Don't use Node.js APIs like `path` module. Also see [the code organization guideline](code-organization.md).
<a name="backend-fs"></a>
* [6.](#backend-fs) On the backend, use Node.js APIS to manipulate the file system, like `fs` and `fs-extra` modules.
> Why? `FileService` is to expose file system capabilities to the frontend only. It's aligned with expectations and requirements on the frontend. Using it on the backend is not possible.
<a name="use-long-name"></a>
* [7.](#use-long-name) Use `LabelProvider.getLongName(uri)` to get a system-wide human-readable representation of a full path. Don't use `uri.toString()` or `uri.path.toString()`.
<a name="use-short-name"></a>
* [8.](#use-short-name) Use `LabelProvider.getName(uri)` to get a system-wide human-readable representation of a simple file name.
<a name="use-icon"></a>
* [9.](#use-icon) Use `LabelProvider.getIcon(uri)` to get a system-wide file icon.
<a name="uri-no-string-manipulation"></a>
* [10.](#uri-no-string-manipulations) Don't use `string` to manipulate URIs and paths. Use `URI` and `Path` capabilities instead, like `join`, `resolve` and `relative`.
> Why? Because object representation can handle corner cases properly, like trailing separators.
```ts
// bad
uriString + '/' + pathString

// good
new URI(uriString).join(pathString)

// bad
pathString.substring(absolutePathString.length + 1)

// good
new Path(absolutePathString).relative(pathString)
```

## Logging
<a name="logging-use-console-log"></a>
* [1.](#logging-use-console-log) Use `console` instead of `ILogger` for the root (top-level) logging.
```ts
// bad
@inject(ILogger)
protected readonly logger: ILogger;

this.logger.info(``);

// good
console.info(``)
```
> Why? All calls to console are intercepted on the frontend and backend and then forwarded to an `ILogger` instance already. The log level can be configured from the CLI: `theia start --log-level=debug`.

## "To Do" Tags
There are situations where we can't properly implement some functionality at the time we merge a PR. In those cases, it is sometimes good practice to leave an indication that something needs to be fixed later in the code. This can be done by putting a "tag" string in a comment. This allows us to find the places we need to fix again later. Currently, we use two "standard" tags in Theia:
 * `@stubbed`
   This tag is used in VS Code API implementations. Sometimes we need an implementation of an API in order for VS Code extensions to start up correctly, but we can't provide a proper  implementation of the underlying feature at this time. This might be because a certain feature has no corresponding UI in Theia or because we do not have the resources to provide a proper implementation.
Using the `@stubbed` tag in a JSDoc comment will mark the element as "stubbed" on the [API status page](https://eclipse-theia.github.io/vscode-theia-comparator/status.html)
 * `@monaco-uplift`
   Use this tag when some functionality can be added or needs to be fixed when we move to a newer version of the monaco editor. If you know which minimum version of Monaco we need, you can add that as a reminder.
