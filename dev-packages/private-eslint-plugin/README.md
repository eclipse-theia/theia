<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - ESLINT PLUGIN</h2>

<hr />

</div>

## Description

The `@theia/eslint-plugin` contributes rules useful for Eclipse Theia development.
The plugin helps identify problems during development through static analysis including code quality, potential issues and code smells.

## Rules

### `annotation-check`

Inversify >=6.1 requires to annotate all constructor parameters of injectable classes as otherwise runtime errors are thrown.
The rule checks that all constructor parameters of injectable classes are annotated with `@inject`, `@unmanaged` or `@multiInject`.

### `localization-check`

The rule prevents the following localization related issues:

- incorrect usage of the `nls.localizeByDefault` function by using an incorrect default value.
- unnecessary call to `nls.localize` which could be replaced by `nls.localizeByDefault`.

### `named-logger-check`

The rule enforces the [logging guidelines](https://github.com/eclipse-theia/theia/tree/master/doc/coding-guidelines.md#logging):

- `@injectable()` classes must log through an injected `ILogger` instead of `console.log`, `console.info`, `console.warn`, `console.error`, `console.debug` or `console.trace`. Console methods without an `ILogger` counterpart, such as `console.time` or `console.group`, are allowed.
- An injected `ILogger` must carry a `@named` decorator whose value follows `[optional-purpose]package-name:class-name#optional-suffix`. The package segment is checked against the `name` of the closest `package.json` without its npm scope, the class segment against the enclosing class. A `@named` value which is not a string literal is not checked.

Code without an `ILogger` binding is exempted through ESLint itself rather than by the rule:

- The `electron-main` runtime is turned off in the `overrides` of `configs/errors.eslintrc.json`, as the Electron main container binds no `ILogger`.
- Individual files, such as the console logger and the log config parser, carry an inline `eslint-disable @theia/named-logger-check` with the reason.

### `no-src-import`

The rule prevents imports using `/src/` rather than `/lib/` as it causes build failures.
The rule helps developers more easily identify the cause of build errors caused by the incorrect import.

#### `runtime-import-check`

The rule prevents imports from folders meant for incompatible runtimes.
The check enforces the [code organization guidelines](https://github.com/eclipse-theia/theia/wiki/Code-Organization) of the framework and guards against invalid imports which may cause unforeseen issues downstream.

#### `shared-dependencies`

The rule prevents the following:

- prevents the implicit use of a shared dependency from `@theia/core`.
- prevents extensions from depending on a shared dependency without re-using it from `@theia/core`.

## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
