# Theia Plugin API and VS Code extensions support

Eclipse Theia is designed for extensibility.
Therefore, it supports [three extension mechanisms: VS Code extensions, Theia extensions, and Theia plugins](https://theia-ide.org/docs/extensions/).
In the following, we focus on the mechanics of Theia plugins and Theia’s compatibility with the [VS Code Extension API](https://code.visualstudio.com/api) in order to support running VS Code extensions in Theia.
This documentation aims to support developers extending Theia’s plugin API to either enhance the extensibility of Theia via plugins and/or increase Theia’s coverage of the VS Code Extension API – and with that the number of VS Code extensions that can be used in Theia.

Theia plugins, as well as VS Code extensions, can be installed and removed from a Theia installation at runtime and may extend many different capabilities of Theia, such as theming, language support, debuggers, tree views, etc., via a clearly defined API.
A plugin runs inside a "host process".
This is a sub-process spawned by Theia's backend to isolate the plugin from the main process.
This encapsulates the plugin to prevent it from arbitrarily accessing Theia services and potentially harm performance or functionality of Theia’s main functionality.
Instead, a plugin accesses Theia’s state and services via the plugin API.

Theia’s plugin API thrives to be a super set of VS Code’s extension API to enable running VS Code extensions as Theia plugins.
For many cases this already works well.
A report on API compatibility is generated daily in the [vscode-theia-comparator repository](https://github.com/eclipse-theia/vscode-theia-comparator).
Please note that the report only checks the API on an interface level – and not the compatibility of the interfaces’ implementation behaviour.
To be sure that an extension is fully supported, it is recommended to test it yourself.
Feel free to [open new issues](https://github.com/eclipse-theia/theia/issues/new/choose) for missing or incomplete API and link them in the report via a [pull request](https://github.com/eclipse-theia/vscode-theia-comparator/compare).
The report can be found here:

[![API Compatibility](https://img.shields.io/badge/API_Compatibility-Status_Report-blue.svg?style=flat-curved)](https://eclipse-theia.github.io/vscode-theia-comparator/status.html)

## Relevant Theia source code

- [plugin](https://github.com/eclipse-theia/theia/tree/master/packages/plugin): Contains the API declaration of the theia plugin namespace
- [plugin-ext](https://github.com/eclipse-theia/theia/tree/master/packages/plugin-ext): Contains both the mechanisms for running plugins and providing them with an API namespace and the implementation of the ‘theia’ plugin API
- [plugin-ext-vscode](https://github.com/eclipse-theia/theia/tree/master/packages/plugin-ext-vscode): Contains an implementation of the VS Code plugin API.
Since VS Code and Theia APIs are largely compatible, the initialization passes on the Theia plugin API and overrides a few members in the API object to be compatible to VS Code extensions (see [plugin-ext-vscode/src/node/plugin-vscode-init.ts](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext-vscode/src/node/plugin-vscode-init.ts))

## API definition and exposure

The plugin API is declared in the [plugin](https://github.com/eclipse-theia/theia/tree/master/packages/plugin) package in file [theia.d.ts](https://github.com/eclipse-theia/theia/blob/master/packages/plugin/src/theia.d.ts).

The implementation of the API defined in the plugin package is passed to a plugin by manipulating the module loading mechanism in plugin containers to construct an API module object.
This enables Theia plugins to import the API via the `@theia/plugin` module in node or via the `theia` namespace in web workers.
For VS Code plugins, the same API is available via the `vscode` namespace as expected by them.

Plugin containers are node processes (see [plugin-ext/src/hosted/node/plugin-host.ts](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext/src/hosted/node/plugin-host.ts))and web workers ([plugin-ext/src/hosted/browser/worker/worker-main.ts](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext/src/hosted/browser/worker/worker-main.ts)).
These expose the API in the following places:

- Browser: assign API object to `window['theia']` in [plugin-ext/src/hosted/browser/worker/worker-main.ts](https://github.com/eclipse-theia/theia/blob/541b300adc029ab1dd729da1ca49179ace1447b2/packages/plugin-ext/src/hosted/browser/worker/worker-main.ts#L192)
- Back-end/Node: Override module loading for Theia plugins in [plugin-ext/src/hosted/node/scanners/backend-init-theia.ts](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext/src/hosted/node/scanners/backend-init-theia.ts) and for VS Code plugins in [plugin-ext-vscode/src/node/plugin-vscode-init.ts](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext-vscode/src/node/plugin-vscode-init.ts)

**Note** that it is not necessary to adapt these for implementing new plugin API.

## Communication between plugin API and Theia

As the plugin runs in a separate process, the plugin API cannot directly communicate with Theia.
Instead, the plugin process and Theia’s main process communicate via RPC.
Therefore, the following "Main-Ext" pattern is used.

![Communication between Theia and Plugin API](./images/plugin-api-diagram.png)

`Ext` refers to the code running on the plugin side inside the isolated host process.
Therefore, this code cannot directly use any Theia services (e.g. via dependency injection).
`Main` refers to code running inside the Theia frontend in the **browser** context.
Therefore, it can access any Theia service just like a [build time Theia extension](https://theia-ide.org/docs/authoring_extensions/).

As the lifecycle of a plugin starts inside its process on the `Ext` side, anything that the plugin needs from Theia (e.g. state, command execution, access to services) has to be invoked over RCP via an implementation on the `Main` side.
In the inverse direction, the same is true for code that runs on the `Main` side and that needs something from the plugin side (e.g. changing plugin state after a user input).
It needs to be invoked over RCP via an implementation on the `Ext` side.
Therefore, `Main` and `Ext` interfaces usually come in pairs (e.g. [LanguagesExt](https://github.com/eclipse-theia/theia/blob/541b300adc029ab1dd729da1ca49179ace1447b2/packages/plugin-ext/src/common/plugin-api-rpc.ts#L1401) and [LanguagesMain](https://github.com/eclipse-theia/theia/blob/541b300adc029ab1dd729da1ca49179ace1447b2/packages/plugin-ext/src/common/plugin-api-rpc.ts#L1474)).

To communicate with each other, the implementation of each side of the API - `Main` and `Ext` - has an RPC proxy of its corresponding counterpart.
The proxy is based on the interface of the other side: `Main` implementation has a proxy of the `Ext` interface and vice versa.
The implementations do not have explicit dependencies to each other.

### Encoding and Decoding RPC Messages

The communication between each side of the API is goverend by proxies that use a `RpcProtocol` on a given channel to transmit RPC messages such as requests and notifications.
In Theia, the encoding and decoding process of RPC messages can be customized through dedicated `RpcMessageEncoder` and `RpcMessageDecoder` classes that can be provided when a new RpcProtocol is created.
The `RpcMessageEncoder` writes RPC messages to a buffer whereas the `RpcMessageDecoder` parses a binary message from a buffer into a RPC message.

By default, Theia uses an encoder and decoder based on [msgpackr](https://www.npmjs.com/package/msgpackr) that already properly handles many built-in types as well as arrays and maps.
We can separately extend the encoding and decoding of our own classes by installing extensions using the `MsgPackExtensionManager` singleton, accessible from both ends of the channel.
Examples of this can be found in the [extension for Errors](https://github.com/eclipse-theia/theia/blob/72421be24d0461f811a39324579913e91056d7c4/packages/core/src/common/message-rpc/rpc-message-encoder.ts#L171) and the [extension for URI, Range and other classes](https://github.com/eclipse-theia/theia/blob/72421be24d0461f811a39324579913e91056d7c4/packages/plugin-ext/src/common/rpc-protocol.ts#L223).
Please note that it is the responsibility of the extension provider to use a free tag between 1 and 100.
We call these extensions in the `index.ts` file to ensure they are available early on.

## Adding new API

This section gives an introduction to extending Theia’s plugin API. If you want to add a complete custom plugin API in your own extension, see this [readme](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext/doc/how-to-add-new-custom-plugin-api.md).

For adding new API, the first step is to declare it in the [theia.d.ts](https://github.com/eclipse-theia/theia/blob/master/packages/plugin/src/theia.d.ts) file in the plugin package.
In a second step, the implementation for the new API must be made available in the returned object of the API factory in [plugin-context.ts](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext/src/plugin/plugin-context.ts).
Typically, functions or properties returned by the API factory delegate to an `Ext` implementation that actually provides the functionality.
See the following shortened and commented excerpt from [plugin-context.ts](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext/src/plugin/plugin-context.ts)#createAPIFactory:

```typescript
// Creates the API factory used to create the API object for each plugin
// Implementations handed into this are shared between plugins
export function createAPIFactory(
    rpc: RPCProtocol,
    pluginManager: PluginManager,
    envExt: EnvExtImpl,
    debugExt: DebugExtImpl,
    preferenceRegistryExt: PreferenceRegistryExtImpl,
    editorsAndDocumentsExt: EditorsAndDocumentsExtImpl,
    workspaceExt: WorkspaceExtImpl,
    messageRegistryExt: MessageRegistryExt,
    clipboard: ClipboardExt,
    webviewExt: WebviewsExtImpl
): PluginAPIFactory {

    // Instantiation of Ext services.
    // Instantiate and register with RPC so that it will be called when the main side uses its proxy.
    const authenticationExt = rpc.set(MAIN_RPC_CONTEXT.AUTHENTICATION_EXT, new AuthenticationExtImpl(rpc));
    const commandRegistry = rpc.set(MAIN_RPC_CONTEXT.COMMAND_REGISTRY_EXT, new CommandRegistryImpl(rpc));
    // [...]

    // The returned function is used to create an instance of the plugin API for a plugin.
    return function (plugin: InternalPlugin): typeof theia {
        const authentication: typeof theia.authentication = {
            // [...]
        };

        // [...]

        // Here the API is returned. Add members of the root namespace directly to the returned object.
        // Each namespace is contained in its own property.
        return <typeof theia>{
            version: require('../../package.json').version,
            // The authentication namespace
            authentication,
            // [...]
            // Types
            StatusBarAlignment: StatusBarAlignment,
            Disposable: Disposable,
            EventEmitter: Emitter,
            CancellationTokenSource: CancellationTokenSource,
            // [...]
        };
    };
}
```

### Adding new Ext and Main interfaces with implementations

`Ext` and `Main` interfaces only contain the functions called over RCP.
Further functions are just part of the implementations.
Functions to be called over RCP must start with `$`, e.g. `$executeStuff`.

- Define `Ext` and `Main` interfaces in [plugin-ext/src/common/plugin-api-rpc.ts](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext/src/common/plugin-api-rpc.ts).
The interfaces should be suffixed with `Ext` and `Main` correspondingly (e.g. `LanguagesMain` and `LanguagesExt`)
- In [plugin-ext/src/common/plugin-api-rpc.ts](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext/src/common/plugin-api-rpc.ts), add a proxy identifier for the `Ext` interface to `MAIN_RPC_CONTEXT` and one for the `Main` interface to `PLUGIN_RPC_CONTEXT`
- Create the `Ext` implementation in folder [plugin-ext/src/plugin](https://github.com/eclipse-theia/theia/tree/master/packages/plugin-ext/src/plugin)
- Create the `Main` implementation in folder [plugin-ext/src/main/browser](https://github.com/eclipse-theia/theia/tree/master/packages/plugin-ext/src/main/browser)
- To communicate via RPC, each implementation has a proxy depending on the interface on the other side.
For instance, see `LanguagesExtImpl` in [plugin-ext/src/plugin/languages.ts](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext/src/plugin/languages.ts) and `LanguagesMainImpl` in [plugin-ext/src/main/browser/languages-main.ts](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext/src/main/browser/languages-main.ts).
They each create the proxy to the other side in their constructors by using the proxy identifiers.

### Complex objects and RPC

When [encoding and decoding RPC messages](#encoding-and-decoding-rpc-messages) pure DTO objects can always safely be transmitted.
For custom classes, we can also adapt the encoding and decoding through extensions.
However, due to the necessary serialization process, functions and references to other objects can never be transmitted safely.

If functions of objects need to be invoked on the opposite side of their creation, the object needs to be cached on the creation side.
The other side receives a handle (usually an id) that can be used to invoke the functionality on the creation side.
As all cached objects are kept in memory, they should be disposed of when they are no longer needed.

For instance, in [LanguagesExtImpl](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext/src/plugin/languages.ts)#registerCodeActionsProvider a new code action provider is created and cached on the `Ext` side and then registered on the `Main` side via its handle.
When the code action provider’s methods are later invoked on the `Main` side (e.g. in [LanguagesMainImpl](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext/src/main/browser/languages-main.ts)#provideCodeActions), it calls the `Ext` side with this handle.
The `Ext` side then gets the cached object, executes appropriate functions and returns the results back to the `Main` side (e.g. in [LanguagesExtImpl](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext/src/plugin/languages.ts)#$provideCodeActions).

Another example to browse are the [TaskExtImpl](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext/src/plugin/tasks/tasks.ts) and [TaskMainImpl](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext/src/main/browser/tasks-main.ts) classes.

As we can see from the language and the task example, in Theia we have a complete API protocol that we need provide for plugins that may not be serializable by default.
In such cases, it has also proven useful to explicitly define a layer of DTO types that are then converted to their API counterpart on the other side.
For Theia, these are defined in [plugin-ext/src/common/plugin-api-rpc.ts](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext/src/common/plugin-api-rpc.ts).
Utility functions to convert between DTO and API types on the `Ext` side are usually added to [plugin-ext/src/plugin/type-converters.ts](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext/src/plugin/type-converters.ts).
Thus, this is also a good starting point to look for conversion utilities for existing types.

### Adding new types

New classes and other types such as enums are usually implemented in [plugin-ext/src/plugin/types-impl.ts](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext/src/plugin/types-impl.ts).
They can be added there and then we can add them to the API object created in the API factory.

## Additional Links

Talk by Thomas Maeder on writing plugin API: <https://www.youtube.com/watch?v=Z_65jy8_9SM>

Adding a new custom plugin API outside of Theia plugin API: [how-to-add-new-custom-plugin-api.md](https://github.com/eclipse-theia/theia/blob/master/packages/plugin-ext/doc/how-to-add-new-custom-plugin-api.md)

Theia Plugin Implementation wiki page: <https://github.com/eclipse-theia/theia/wiki/Theia-Plugin-Implementation>

Writing Plugin API wiki page in the che wiki: <https://github.com/eclipse/che/wiki/Writing-Theia-plugin-API>

Theia versus VS Code API Comparator: <https://github.com/eclipse-theia/vscode-theia-comparator>

Theia's extension mechanisms: VS Code extensions, Theia extensions, and Theia plugins: <https://theia-ide.org/docs/extensions>

Example of creating a custom namespace API and using in VS Code extensions: <https://github.com/thegecko/vscode-theia-extension>
