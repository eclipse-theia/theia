# How to add a new plugin API namespace

This document describes how to add new plugin API namespace in the plugin host.
Depending on the plugin host we can either provide a frontend or backend API extension:

- In the backend plugin host that runs in the Node environment in a separate process, we adapt the module loading to return a custom API object instead of loading a module with a particular name.
- In the frontend plugin host that runs in the browser environment via a web worker, we import the API scripts and put it in the global context.

In this document we focus on the implementation of a backend plugin API.
However, both APIs can be provided by implementing and binding an `ExtPluginApiProvider` which should be packaged as a Theia extension.

## Declare your plugin API provider

The plugin API provider is executed on the respective plugin host to add your custom API namespace.

Example Foo Plugin API provider:

```typescript
@injectable()
export class FooExtPluginApiProvider implements ExtPluginApiProvider {
    provideApi(): ExtPluginApi {
        return {
            frontendExtApi: {
                initPath: '/path/to/foo/api/implementation.js',
                initFunction: 'fooInitializationFunction',
                initVariable: 'foo_global_variable'
            },
            backendInitPath: path.join(__dirname, 'foo-init')
        };
    }
}
```

Register your Plugin API provider in a backend module:

```typescript
    bind(FooExtPluginApiProvider).toSelf().inSingletonScope();
    bind(Symbol.for(ExtPluginApiProvider)).toService(FooExtPluginApiProvider);
```

## Define your API

To ease the usage of your API, it should be developed as separate npm package that can be easily imported without any additional dependencies, cf, the VS Code API or the Theia Plugin API.

Example `foo.d.ts`:

```typescript
declare module '@bar/foo' {
    export namespace fooBar {
        export function getFoo(): Promise<Foo>;
    }
}
```

## Implement your plugin API provider

In our example, we aim to provide a new API object for the backend.
Theia expects that the `backendInitPath` that we specified in our API provider is a function called `provideApi` that follows the `ExtPluginApiBackendInitializationFn` signature.

Example `foo-init.ts`:

```typescript
import * as fooBarAPI from '@bar/foo';

// Factory to create an API object for each plugin.
let apiFactory: (plugin: Plugin) => typeof fooBarAPI;

// Map key is the plugin ID. Map value is the FooBar API object.
const pluginsApiImpl = new Map<string, typeof fooBarAPI>();

// Singleton API object to use as a last resort.
let defaultApi: typeof fooBarAPI;

// Have we hooked into the module loader yet?
let hookedModuleLoader = false;

let plugins: PluginManager;

// Theia expects an exported 'provideApi' function
export const provideApi: ExtPluginApiBackendInitializationFn = (rpc: RPCProtocol, manager: PluginManager) => {
    apiFactory = createAPIFactory(rpc);
    plugins = manager;

    if (!hookedModuleLoader) {
        overrideInternalLoad();
        hookedModuleLoader = true;
    }
};

function overrideInternalLoad(): void {
    const module = require('module');
    const internalLoad = module._load;

    module._load = function (request: string, parent: any, isMain: {}) {
        if (request !== '@bar/foo') {
            // Pass the request to the next implementation down the chain
            return internalLoad.apply(this, arguments);
        }

        // create custom API object and return that as a result of loading '@bar/foo'
        const plugin = findPlugin(parent.filename);
        if (plugin) {
            let apiImpl = pluginsApiImpl.get(plugin.model.id);
            if (!apiImpl) {
                apiImpl = apiFactory(plugin);
                pluginsApiImpl.set(plugin.model.id, apiImpl);
            }
            return apiImpl;
        }

        if (!defaultApi) {
            console.warn(`Could not identify plugin for '@bar/foo' require call from ${parent.filename}`);
            defaultApi = apiFactory(emptyPlugin);
        }

        return defaultApi;
    };
}

function findPlugin(filePath: string): Plugin | undefined {
    return plugins.getAllPlugins().find(plugin => filePath.startsWith(plugin.pluginFolder));
}
```

## Implement your API object

We create a dedicated API object for each individual plugin as part of the module loading process.
Each API object is returned as part of the module loading process if a script imports `@bar/foo` and should therefore match the API definition that we provided in the `*.d.ts` file.
Multiple imports will not lead to the creation of multiple API objects as we cache it in our custom `overrideInternalLoad` function.

Example `foo-init.ts` (continued):

```typescript
export function createAPIFactory(rpc: RPCProtocol): ApiFactory {
    const fooExtImpl = new FooExtImpl(rpc);
    return function (plugin: Plugin): typeof fooBarAPI {
        const FooBar: typeof fooBarAPI.fooBar = {
            getFoo(): Promise<fooBarAPI.Foo> {
                return fooExtImpl.getFooImpl();
            }
        }
        return <typeof fooBarAPI>{
            fooBar : FooBar
        };
    }
}
```

In the example above the API object creates a local object that will fulfill the API contract.
The implementation details are hidden by the object and it could be a local implementation that only lives inside the plugin host but it could also be an implementation that uses the `RPCProtocol` to communicate with the main application to trigger changes, register functionality or retrieve information.

### Implementing Main-Ext communication

In this document, we will only highlight the individual parts needed to establish the communication between the main application and the external plugin host.
For a more elaborate example of an API that communicates with the main application, please have a look at the definition of the [Theia Plugin API](https://github.com/eclipse-theia/theia/blob/master/doc/Plugin-API.md).

First, we need to establish the communication on the RPC protocol by providing an implementation for our own side and generating a proxy for the opposite side.
Proxies are identified using dedicated identifiers so we set them up first, together with the expected interfaces.
`Ext` and `Main` interfaces contain the functions called over RCP and must start with `$`.
Due to the asynchronous nature of the communication over RPC, the result should always be a `Promise` or `PromiseLike`.

Example `common/foo-api-rpc.ts`:

```typescript
export interface FooMain {
    $getFooImpl(): Promise<Foo>;
}

export interface FooExt {
    // placeholder for callbacks for the main application to the extension
}

// Plugin host will obtain a proxy using these IDs, main application will register an implementation for it.
export const PLUGIN_RPC_CONTEXT = {
    FOO_MAIN: createProxyIdentifier<FooMain>('FooMain')
};

// Main application will obtain a proxy using these IDs, plugin host will register an implementation for it.
export const MAIN_RPC_CONTEXT = {
    FOO_EXT: createProxyIdentifier<FooExt>('FooExt')
};
```

On the plugin host side we can register our implementation and retrieve the proxy as part of our `createAPIFactory` implementation:

Example `foo-ext.ts`:

```typescript
export class FooExtImpl implements FooExt {
    // Main application RCP counterpart
    private proxy: FooMain;

    constructor(rpc: RPCProtocol) {
        rpc.set(MAIN_RPC_CONTEXT.FOO_EXT, this); // register ourselves
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.FOO_MAIN); // retrieve proxy
    }

    getFooImpl(): Promise<Foo> {
        return this.proxy.$getFooImpl();
    }
}
```

On the main side we need to implement the counterpart of the ExtPluginApiProvider, the `MainPluginApiProvider`, and expose it in a browser frontend module:

Example `foo-main.ts`:

```typescript
@injectable()
export class FooMainImpl implements FooMain {
    @inject(MessageService) protected messageService: MessageService;
    protected proxy: FooExt;

    init(rpc: RPCProtocol) {
        // We would use this if we had a need to call back into the plugin-host/plugin
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.FOO_EXT);
    }

    async $getFooImpl(): Promise<Foo> {
        this.messageService.info('We were called from the plugin-host at the behest of the plugin.');
        return new Foo();
    }
}

@injectable()
export class FooMainPluginApiProvider implements MainPluginApiProvider {
    @inject(MessageService) protected messageService: MessageService;

    initialize(rpc: RPCProtocol, container: interfaces.Container): void {
        this.messageService.info('Initialize RPC communication for FooMain!');
        // create a new FooMainImpl as it is not bound as singleton
        const fooMainImpl = container.get(FooMainImpl);
        fooMainImpl.init(rpc);
        rpc.set(PLUGIN_RPC_CONTEXT.FOO_MAIN, fooMainImpl);
    }
}

export default new ContainerModule(bind => {
    bind(FooMainImpl).toSelf();
    bind(MainPluginApiProvider).to(FooMainPluginApiProvider).inSingletonScope();
});
```

In this example, we can already see the big advantage of going to the main application side as we have full access to our Theia services.

## Usage in a plugin

When using the API in a plugin the user can simply use the API as follows:

```typescript
import * as foo from '@bar/foo';

foo.fooBar.getFoo();
```

## Packaging

When bundling our application with the generated `gen-webpack.node.config.js` we need to make sure that our initialization function is bundled as a `commonjs2` library so it can be dynamically loaded.

```typescript
const configs = require('./gen-webpack.config.js');
const nodeConfig = require('./gen-webpack.node.config.js');

if (nodeConfig.config.entry) {
    /**
     * Add our initialization function. If unsure, look at the already generated entries for
     * the nodeConfig where an entry is added for the default 'backend-init-theia' initialization.
     */
    nodeConfig.config.entry['foo-init'] = {
        import: require.resolve('@namespace/package/lib/node/foo-init'),
        library: { type: 'commonjs2' }
    };
}

module.exports = [...configs, nodeConfig.config];

```
