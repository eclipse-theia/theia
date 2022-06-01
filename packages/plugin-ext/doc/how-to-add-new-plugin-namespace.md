# This document describes how to add new plugin api namespace

New Plugin API namespace should be packaged as Theia extension

## Provide your API or namespace

This API developed in the way that you provide your API as separate npm package.
In that package you can declare your api.
Example `foo.d.ts`:

```typescript
    declare module '@bar/foo' {
        export namespace fooBar {
            export function getFoo(): Foo;
        }
    }
```

## Declare `ExtPluginApiProvider` implementation

```typescript
@injectable()
export class FooPluginApiProvider implements ExtPluginApiProvider {
    provideApi(): ExtPluginApi {
        return {
            frontendExtApi: {
                initPath: '/path/to/foo/api/implementation.js',
                initFunction: 'fooInitializationFunction',
                initVariable: 'foo_global_variable'
            },
            backendInitPath: path.join(__dirname, 'path/to/backend/foo/implementation.js')
        };
    }
}
```

## Then you need to register `FooPluginApiProvider`, add next sample in your backend module

Example:

```typescript
    bind(FooPluginApiProvider).toSelf().inSingletonScope();
    bind(Symbol.for(ExtPluginApiProvider)).toService(FooPluginApiProvider);
```

## Next you need to implement `ExtPluginApiBackendInitializationFn`, which should handle `@bar/foo` module loading and instantiate `@foo/bar` API object, `path/to/backend/foo/implementation.js` example :

```typescript
export const provideApi: ExtPluginApiBackendInitializationFn = (rpc: RPCProtocol, pluginManager: PluginManager) => {
    cheApiFactory = createAPIFactory(rpc);
    plugins = pluginManager;

    if (!isLoadOverride) {
        overrideInternalLoad();
        isLoadOverride = true;
    }

};

function overrideInternalLoad(): void {
    const module = require('module');
    const internalLoad = module._load;

    module._load = function (request: string, parent: any, isMain: {}) {
        if (request !== '@bar/foo') {
            return internalLoad.apply(this, arguments);
        }

        const plugin = findPlugin(parent.filename);
        if (plugin) {
            let apiImpl = pluginsApiImpl.get(plugin.model.id);
            if (!apiImpl) {
                apiImpl = cheApiFactory(plugin);
                pluginsApiImpl.set(plugin.model.id, apiImpl);
            }
            return apiImpl;
        }

        if (!defaultApi) {
            console.warn(`Could not identify plugin for '@bar/foo' require call from ${parent.filename}`);
            defaultApi = cheApiFactory(emptyPlugin);
        }

        return defaultApi;
    };
}

function findPlugin(filePath: string): Plugin | undefined {
    return plugins.getAllPlugins().find(plugin => filePath.startsWith(plugin.pluginFolder));
}
```

## Next you need to implement `createAPIFactory` factory function

Example:

```typescript
import * as fooApi from '@bar/foo';
export function createAPIFactory(rpc: RPCProtocol): ApiFactory {
    const fooBarImpl = new FooBarImpl(rpc);
    return function (plugin: Plugin): typeof fooApi {
        const FooBar: typeof fooApi.fooBar = {
            getFoo(): fooApi.Foo{
                return fooBarImpl.getFooImpl();
            }
        }
        return <typeof fooApi>{
            fooBar : FooBar
        };
    }

```
