<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - CORE EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/core` extension is the main extension for all Theia-based applications, and provides the main framework for all dependent extensions.
The extension provides the base APIs for all Theia-based applications, including:
- Application APIs
- Shell APIs
- Base Widgets
- Contribution Points (ex: commands, menu items, keybindings)

## Theia Extension

A Theia extension is a node package declaring `theiaExtensions` property in `package.json`:

```json
{
  "theiaExtensions": [{
      "frontend": "lib/myExtension/browser/myextension-frontend-module",
      "backend": "lib/myExtension/node/myextension-backend-module",
    }, {
      "frontend": "lib/myExtension2/browser/myextension2-browser-module",
      "frontendElectron": "lib/myExtension2/electron-browser/myextension2-electron-browser-module",
      "backend": "lib/myExtension2/node/myextension2-node-module",
      "backendElectron": "lib/myExtension2/electron-main/myextension2-electron-main-module"
  }]
}
```

Each extension can consist of the following modules:
- `frontend` is used in the browser env and as well in the electron if `frontendElectron` is not provided
- `frontendElectron` is used in the electron env
- `backend` is used in the node env and as well in the electron env if `backendElectron` is not provided
- `backendElectron` is used in the electron env

An extension module should have a default export of `ContainerModule | Promise<ContainerModule>` type.

## Theia Application

A Theia application is a node package listing [Theia extensions](#theia-extension) as dependencies and managed with [Theia CLI](../../dev-packages/cli/README.md).

## Re-Exports Mechanism

In order to make application builds more stable `@theia/core` re-exports some common dependencies for Theia extensions to re-use. This is especially useful when having to re-use the same dependencies as `@theia/core` does: Since those dependencies will be pulled by Theia, instead of trying to match the same version in your own packages, you can use re-exports to consume it from the framework directly.

### Usage Example

Let's take inversify as an example since you will most likely use this package, you can import it by prefixing with `@theia/core/shared/`:

```ts
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class SomeClass {
    // ...
}
```

## Re-Exports

{{#reExportsDirectories}}
- `@theia/core/{{&directory}}/...`
    {{#packages}}
    {{#modules}}
    - `{{&moduleName}}` (from [`{{&packageName}}@{{&versionRange}}`]({{&npmUrl}}))
    {{/modules}}
    {{/packages}}
{{/reExportsDirectories}}

## Logging Configuration

It's possible to change the log level for the entire Theia application by
passing it the `--log-level={fatal,error,warn,info,debug,trace}` option.  For
more fine-grained adjustment, it's also possible to set the log level per
logger (i.e. per topic).  The `root` logger is a special catch-all logger
through which go all messages not sent through a particular logger.  To change
the log level of particular loggers, create a config file such as

```json
{
  "defaultLevel": "info",
  "levels": {
    "terminal": "debug",
    "task": "error"
  }
}
```

where `levels` contains the logger-to-log-level mapping.  `defaultLevel`
contains the log level to use for loggers not specified in `levels`.  This file
can then be specified using the `--log-config` option.  Theia will watch that
file for changes, so it's possible to change log levels at runtime by
modifying this file.

It's unfortunately currently not possible to query Theia for the list of
existing loggers.  However, each log message specifies from which logger it
comes from, which can give an idea, without having to read the code:

```
root INFO [nsfw-watcher: 10734] Started watching: /Users/captain.future/git/theia/CONTRIBUTING.md
^^^^ ^^^^  ^^^^^^^^^^^^^^^^^^^
```
Where `root` is the name of the logger and `INFO` is the log level. These are optionally followed by the name of a child process and the process ID.

## Environment Variables

- `THEIA_HOSTS`
  - A comma-separated list of hosts expected to resolve to the current application.
    - e.g: `theia.app.com,some.other.domain:3000`
  - The port number is important if your application is not hosted on either `80` or `443`.
  - If possible, you should set this environment variable:
    - When not set, Theia will allow any origin to access the WebSocket services.
    - When set, Theia will only allow the origins defined in this environment variable.

## Additional Information

- [API documentation for `@theia/core`](https://eclipse-theia.github.io/theia/docs/next/modules/core.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark
"Theia" is a trademark of the Eclipse Foundation
https://www.eclipse.org/theia
