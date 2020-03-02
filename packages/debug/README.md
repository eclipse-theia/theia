<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>THEIA - DEBUG EXTENSION</h2>

<hr />

</div>

## Architecture

`DebugService` is used to initialize a new `DebugSession`. This service provides functionality to configure and to start a new debug session. The workflow is the following. If user wants to debug an application and there is no debug configuration associated with the application then the list of available debuggers is requested to create a suitable debug configuration. When configuration is chosen it is possible to alter the configuration by filling in missing values or by adding/changing/removing attributes.

In most cases the default behavior of the `DebugSession` is enough. But it is possible to provide its own implementation. The `DebugSessionFactory` is used for this purpose via `DebugSessionContribution`. Documented model objects are located [here](https://github.com/eclipse-theia/theia/tree/master/packages/debug/src/browser/debug-model.ts)

### Debug Session life-cycle API

`DebugSession` life-cycle is controlled and can be tracked as follows:
* An `onDidPreCreateDebugSession` event indicates that a debug session is going to be created.
* An `onDidCreateDebugSession` event indicates that a debug session has been created.
* An `onDidDestroyDebugSession` event indicates that a debug session has terminated.
* An `onDidChangeActiveDebugSession` event indicates that an active debug session has been changed

### Breakpoints API

`ExtDebugProtocol.AggregatedBreakpoint` is used to handle breakpoints on the client side. It covers all three breakpoint types: `DebugProtocol.SourceBreakpoint`, `DebugProtocol.FunctionBreakpoint` and `ExtDebugProtocol.ExceptionBreakpoint`. It is possible to identify a breakpoint type with help of `DebugUtils`. Notification about added, removed, or changed breakpoints is received via `onDidChangeBreakpoints`.

### Server side

At the back-end we start a debug adapter using `DebugAdapterFactory` and then a `DebugAdapterSession` is instantiated which works as a proxy between client and debug adapter. If a default implementation of the debug adapter session does not fit needs, it is possible to provide its own implementation using `DebugAdapterSessionFactory`. If so, it is recommended to extend the default implementation of the `DebugAdapterSession`. Documented model objects are located [here](https://github.com/eclipse-theia/theia/tree/master/packages/debug/src/node/debug-model.ts)

`DebugSessionState` accumulates debug adapter events and is used to restore debug session on the client side when page is refreshed.

## How to contribute a new debugger

`DebugAdapterContribution` is a contribution point for all debug adapters to provide and resolve debug configuration.

## Additional Information

- [API documentation for `@theia/debug`](https://eclipse-theia.github.io/theia/docs/next/modules/debug.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)
- [Debug Adapter Protocol](https://github.com/Microsoft/vscode-debugadapter-node/blob/master/protocol/src/debugProtocol.ts)
- [VS Code debug API](https://code.visualstudio.com/docs/extensionAPI/api-debugging)
- [Debug adapter example for VS Code](https://code.visualstudio.com/docs/extensions/example-debuggers)

## Debug adapter implementations for VS Code
* [Node Debugger](https://github.com/microsoft/vscode-node-debug)
* [Node Debugger 2](https://github.com/microsoft/vscode-node-debug2)
* [Java Debugger](https://github.com/Microsoft/vscode-java-debug)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark
"Theia" is a trademark of the Eclipse Foundation
https://www.eclipse.org/theia
