<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>THEIA - ELECTRON</h2>

<hr />

</div>

## Description

The `@theia/electron` extension provides the main Electron entrypoint for Theia as well as runtime dependencies. The `@theia/electron` package is mandatory for any `electron`
[application target](dev-packages/cli/README.md#build-target).

The default entrypoint will handle a very rudimentary CLI to open workspaces by doing `app path/to/workspace`. To override this behavior, you can extend and rebind the
`ElectronApplication` class and overriding the `launch` method.

A JSON-RPC communication between the Electron Main Process and the Renderer Processes is available: You can bind services using the `ElectronConnectionHandler` and
`ElectronIpcConnectionProvider` APIs, example:

From an `electron-main` module:

```ts
    bind(ElectronConnectionHandler).toDynamicValue(context =>
        new JsonRpcConnectionHandler(electronMainWindowServicePath,
            () => context.container.get(ElectronMainWindowService))
    ).inSingletonScope();
```

And from the `electron-browser` module:

```ts
    bind(ElectronMainWindowService).toDynamicValue(context =>
        ElectronIpcConnectionProvider.createProxy(context.container, electronMainWindowServicePath)
    ).inSingletonScope();
```

The extension includes the following yarn/npm commands:

- `npx electron-replace-ffmpeg [--help]`
- `npx electron-codecs-test [--help]`

Both scripts will be triggered on post-install, targeting the current
architecture and "closest" Electron installation (in `node_modules`).

The post-install scripts can be skipped by setting an environment variable:

- Mac/Linux: `export THEIA_ELECTRON_SKIP_REPLACE_FFMPEG=1`
- Windows (cmd): `set THEIA_ELECTRON_SKIP_REPLACE_FFMPEG=1`
- Windows (ps): `$env:THEIA_ELECTRON_SKIP_REPLACE_FFMPEG=1`

## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark
"Theia" is a trademark of the Eclipse Foundation
https://www.eclipse.org/theia
