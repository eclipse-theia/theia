# Basic architecture overview
![Theia Plugin API](https://user-images.githubusercontent.com/436777/37775864-5cf856d0-2de4-11e8-8f55-2b5a5de72908.png)

## Plugin runtime
Plugin runtime is a JavaScript runtime for Theia plugins, for now we have two types of the runtime:

1. WebWorker - for frontend plugins
2. Separate Node.JS instance - for backend plugins

## plugin-ext structure

[api](../src/api) - protocol and model objects for communication between Theia client and plugins runtime

[main](../src/main) - Theia part if plugin API. Code inside this directory is simple Theia extension and can use all functionality provided by Theia like `inversify`;

[plugin](../src/plugin) - Plugin runtime part of the Plugin API. Here place for all types and namespaces described in [theia.d.ts](../../plugin/src/theia.d.ts)

## How to add new Plugin API

### Add new method/namespace to [theia.d.ts](../../plugin/src/theia.d.ts)

You can copy from `vscode.d.ts` or provide your own.
For example, adding Command API:

```typescript
export namespace commands {
        export function registerCommand(command: Command handler?: (...args: any[]) => any): Disposable;
}
```

### Add implementation of your API

All implementations is stored in [plugin-context.ts](../src/plugin/plugin-context.ts)
`plugin-context.ts` contains `createAPIFactory` function which returns factory function which return own instance of Theia Plugin API for plugin.
In that factory function you should provide implementation for API that you added in `theia.d.ts`. You should put your implementation in proper(the same) namespace object.

#### Namespace handling

If you add new namespace you need to create new namespace object and add it in object returned from factory function. For example:

```typescript
const commands: typeof theia.commands = {
    // implementation of commands namespace function and fields
};


return <typeof theia>{
    ...
    // add your namespace and types there
    commands,
    ...
}
```

#### New type adding

Also you can add interfaces, classes and enums in `theia.d.ts`.
Interfaces doesn't require anything special. But for classes and enums you should provide implementation. Common place for this implementations is [types-impl.ts](../src/plugin/types-impl.ts)

Example:
Adding new class in `theia.d.ts`:

```typescript
export class Foo {
    public bar: string;
    constructor(bar: string);
}
```

You need to provide implementation of `Foo` class in [types-impl.ts](../src/plugin/types-impl.ts):

```typescript
export class Foo {
    constructor(public bar: string){
    }
}
```

Then in [plugin-context.ts](../src/plugin/plugin-context.ts):

```typescript
import {Foo} from './types-impl';

...

return <typeof theia>{
    ...
    Foo,
    ...
}
```

> For enums you should do the same. Usually it's just copying enum declaration from `theia.d.ts` to `types-impl.ts`, and adding that enum in to `theia` object returned by `createAPIFactory` factory function

#### Adding plugin runtime part of the API implementation - TODO

### Working with RPC proxy - TODO

#### Theia <-> Plugin runtime communication - TODO

##### *Ext and *Main interfaces - TODO

### Adding Theia part of the API implementation - TODO
