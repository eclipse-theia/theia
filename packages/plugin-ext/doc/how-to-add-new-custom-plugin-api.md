# How to add new custom plugin API

As a Theia developer, you might want to make your app extensible by plugins in ways that are unique to your application.
That will require API that goes beyond what's in the VS Code Extension API and the Theia plugin API.
You can do that by implementing a Theia extension that creates and exposes an API object within the plugin host.
The API object can be imported by your plugins and exposes one or more API namespaces.

Depending on the plugin host we can either provide a frontend or backend plugin API, or an API for headless plugins that extend or otherwise access backend services:

- In the backend plugin host that runs in the Node environment in a separate process, we adapt the module loading to return a custom API object instead of loading a module with a particular name.
There is a distinct plugin host for each connected Theia frontend.
- In the frontend plugin host that runs in the browser environment via a web worker, we import the API scripts and put it in the global context.
There is a distinct plugin host for each connected Theia frontend.
- In the headless plugin host that also runs in the Node environment in a separate process, we similarly adapt the module loading mechanism.
When the first headless plugin is deployed, whether at start-up or upon later installation during run-time, then the one and only headless plugin host process is started.

In this document we focus on the implementation of a custom backend plugin API.
Headless plugin APIs are similar, and the same API can be contributed to both backend and headless plugin hosts.
All three APIs — backend, frontend, and headless — can be provided by implementing and binding an `ExtPluginApiProvider` which should be packaged as a Theia extension.

## Declare your plugin API provider

The plugin API provider is executed on the respective plugin host to add your custom API object and namespaces.
Add `@theia/plugin-ext` as a dependency in your `package.json`.
If your plugin is contributing API to headless plugins, then you also need to add the `@theia/plugin-ext-headless` package as a dependency.

Example Foo Plugin API provider.
Here we see that it provides the same API initialized by the same script to both backend plugins that are frontend-connection-scoped and to headless plugins.
Any combination of these API initialization scripts may be provided, offering the same or differing capabilities in each respective plugin host, although of course it would be odd to provide API to none of them.

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
            backendInitPath: path.join(__dirname, 'foo-init'),
            // Provide the same API to headless plugins, too (or a different/subset API)
            headlessInitPath: path.join(__dirname, 'foo-init')
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
    export class Foo { }

    export namespace fooBar {
        export function getFoo(): Promise<Foo>;
    }
}
```

## Implement your plugin API provider

In our example, we aim to provide a new API object for the backend.
Theia expects that the `backendInitPath` or `headlessInitPath` that we specified in our API provider exports an [InversifyJS](https://inversify.io) `ContainerModule` under the name `containerModule`.
This container-module configures the Inversify `Container` in the plugin host for creation of our API object.
It also implements for us the customization of Node's module loading system to hook our API factory into the import of the module name that we choose.

Example `node/foo-init.ts`:

```typescript
import { inject, injectable } from '@theia/core/shared/inversify';
import { RPCProtocol } from '@theia/plugin-ext/lib/common/rpc-protocol';
import { Plugin } from '@theia/plugin-ext/lib/common/plugin-api-rpc';
import { PluginContainerModule } from '@theia/plugin-ext/lib/plugin/node/plugin-container-module';
import { FooExt } from '../common/foo-api-rpc';
import { FooExtImpl } from './foo-ext-impl';

import * as fooBarAPI from '@bar/foo';

type FooBarApi = typeof fooBarAPI;
type Foo = FooBarApi['Foo'];

const FooBarApiFactory = Symbol('FooBarApiFactory');

// Retrieved by Theia to configure the Inversify DI container when the plugin is initialized.
// This is called when the plugin-host process is forked.
export const containerModule = PluginContainerModule.create(({ bind, bindApiFactory }) => {
    // Bind the implementations of our Ext API interfaces (here just one)
    bind(FooExt).to(FooExtImpl).inSingletonScope();

    // Bind our API factory to the module name by which plugins will import it
    bindApiFactory('@bar/foo', FooBarApiFactory, FooBarApiFactoryImpl);
});
```

## Implement your API object

We create a dedicated API object for each individual plugin as part of the module loading process.
Each API object is returned as part of the module loading process if a script imports `@bar/foo` and should therefore match the API definition that we provided in the `*.d.ts` file.
Multiple imports will not lead to the creation of multiple API objects as the `PluginContainerModule` automatically caches the API implementation for us.

Example `node/foo-init.ts` (continued):

```typescript
// Creates the @foo/bar API object
@injectable()
class FooBarApiFactoryImpl {
    @inject(RPCProtocol) protected readonly rpc: RPCProtocol;
    @inject(FooExt) protected readonly fooExt: FooExt;

    @postConstruct()
    initialize(): void {
        this.rpc.set(FOO_MAIN_RPC_CONTEXT.FOO_EXT, this.fooExt);
    }

    // The plugin host expects our API factory to export a `createApi()` method
    createApi(plugin: Plugin): FooBarApi {
        const self = this;
        return {
            fooBar: {
                getFoo(): Promise<Foo> {
                    return self.fooExt.getFooImpl();
                }
            }
        };
    };
}
```

In the example above the API object creates a local object that will fulfill the API contract.
The implementation details are hidden by the object and it could be a local implementation that only lives inside the plugin host but it could also be an implementation that uses the `RPCProtocol` to communicate with the main application to trigger changes, register functionality or retrieve information.

### Implement Main-Ext communication

In this document, we will only highlight the individual parts needed to establish the communication between the main application and the external plugin host.
For a more elaborate example of an API that communicates with the main application, please have a look at the definition of the [Theia Plugin API](https://github.com/eclipse-theia/theia/blob/master/doc/Plugin-API.md).

First, we need to establish the communication on the RPC protocol by providing an implementation for our own side and generating a proxy for the opposite side.
Proxies are identified using dedicated identifiers so we set them up first, together with the expected interfaces.
`Ext` and `Main` interfaces contain the functions called over RCP and must start with `$`.
Due to the asynchronous nature of the communication over RPC, the result should always be a `Promise` or `PromiseLike`.

Example `common/foo-api-rpc.ts`:

```typescript
export const FooMain = Symbol('FooMain');
export interface FooMain {
    $getFooImpl(): Promise<Foo>;
}

export const FooExt = Symbol('FooExt');
export interface FooExt {
    // placeholder for callbacks for the main application to the extension
}

// Plugin host will obtain a proxy using these IDs, main application will register an implementation for it.
export const FOO_PLUGIN_RPC_CONTEXT = {
    FOO_MAIN: createProxyIdentifier<FooMain>('FooMain')
};

// Main application will obtain a proxy using these IDs, plugin host will register an implementation for it.
export const FOO_MAIN_RPC_CONTEXT = {
    FOO_EXT: createProxyIdentifier<FooExt>('FooExt')
};
```

On the plugin host side we can register our implementation and retrieve the proxy as part of our `createAPIFactory` implementation:

Example `plugin/foo-ext.ts`:

```typescript
import { inject, injectable } from '@theia/core/shared/inversify';
import { RPCProtocol } from '@theia/plugin-ext/lib/common/rpc-protocol';
import { FooExt, FooMain, FOO_PLUGIN_RPC_CONTEXT } from '../common/foo-api-rpc';

@injectable()
export class FooExtImpl implements FooExt {
    // Main application RCP counterpart
    private proxy: FooMain;

    constructor(@inject(RPCProtocol) rpc: RPCProtocol) {
        // Retrieve a proxy for the main side
        this.proxy = rpc.getProxy(FOO_PLUGIN_RPC_CONTEXT.FOO_MAIN);
    }

    getFooImpl(): Promise<Foo> {
        return this.proxy.$getFooImpl();
    }
}
```

On the main side we need to implement the counterpart of the ExtPluginApiProvider, the `MainPluginApiProvider`, and expose it in a browser frontend module.

> [!NOTE]
> If the same API is also published to headless plugins, then the Main side is actually in the Node backend, not the browser frontend, so the implementation might
then be in the `common/` tree and registered in both the frontend and backend container modules.
> Alternatively, if the API is _only_ published to headless plugins, then it can be implemented in the `node/` tree and can take advantage of capabilities only available in the Node backend.

Example `main/browser/foo-main.ts`:

```typescript
@injectable()
export class FooMainImpl implements FooMain {
    @inject(MessageService) protected messageService: MessageService;
    protected proxy: FooExt;

    constructor(@inject(RPCProtocol) rpc: RPCProtocol) {
        // We would use this if we had a need to call back into the plugin-host/plugin
        this.proxy = rpc.getProxy(FOO_MAIN_RPC_CONTEXT.FOO_EXT);
    }

    async $getFooImpl(): Promise<Foo> {
        this.messageService.info('We were called from the plugin-host at the behest of the plugin.');
        return new Foo();
    }
}

@injectable()
export class FooMainPluginApiProvider implements MainPluginApiProvider {
    @inject(MessageService) protected messageService: MessageService;
    @inject(FooMain) protected fooMain: FooMain;

    initialize(rpc: RPCProtocol): void {
        this.messageService.info('Initialize RPC communication for FooMain!');
        rpc.set(FOO_PLUGIN_RPC_CONTEXT.FOO_MAIN, this.fooMain);
    }
}

export default new ContainerModule(bind => {
    bind(MainPluginApiProvider).to(FooMainPluginApiProvider).inSingletonScope();
    bind(FooMain).to(FooMainImpl).inSingletonScope();
});
```

In this example, we can already see the big advantage of going to the main application side as we have full access to our Theia services.

## Usage in a plugin

When using the API in a plugin the user can simply use the API as follows:

```typescript
import * as foo from '@bar/foo';

foo.fooBar.getFoo();
```

## Adding custom plugin activation events

When creating a custom plugin API there may also arise a need to trigger the activation of your plugins at a certain point in time.
The events that trigger the activation of a plugin are simply called `activation events`.
By default Theia supports a set of built-in activation events that contains the [activation events from VS Code](https://code.visualstudio.com/api/references/activation-events) as well as some additional Theia-specific events.
Technically, an activation event is nothing more than a unique string fired at a specific point in time.
To add more flexibility to activations events, Theia allows you to provide additional custom activation events when initializing a plugin host.
These additional events can be specified by adopters through the `ADDITIONAL_ACTIVATION_EVENTS` environment variable.
To fire an activation event, you need to call the plugin hosts `$activateByEvent(eventName)` method.

## Packaging

When bundling our application with the generated `gen-webpack.node.config.js` we need to make sure that our initialization function is bundled as a `commonjs2` library so it can be dynamically loaded.
Adjust the `webpack.config.js` accordingly:

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
