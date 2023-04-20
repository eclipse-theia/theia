# `@theia/core/lib/electron-common`

## Preload Utilities

Theia uses context isolation for its Electron browser windows. This means there
are 2 distincts JS environments running within windows.

### Preload Context

This context has access to Electron's APIs to communicate with the Electron main
process. This context may exposes APIs to the browser context so that features
requiring interactions with the Electron main context may be implemented.

Electron only supports exposing "dumb objects" e.g.

```ts
// Functions here are part of the object's own keys:
const someApi = {
    regularFunction() {
        // ...
    }
    arrowFunction: () => {
        // ...
    }
};
// Exposes an object with methods: regularFunction, arrowFunction.
contextBridge.exposeInMainWorld('someApi', someApi);

// Methods of a class are not part of an instance's own keys:
class OtherApi {
    myMethod() {
        // ...
    }
}
const otherApi = new OtherApi();
// Works here:
otherApi.myMethod();
// But this exposes an empty object! myMethod is lost:
contextBridge.exposeInMainWorld('someApi', someApi);
```

In order to expose APIs bound using classes with Inversify, Theia proposes a
decorator based API:

```ts
import { inject, injectable } from '@theia/core/shared/inversify';
import { proxy, proxyable, TheiaIpcRenderer } from '@theia/core/lib/electron-common';
import { MyApi } from '../my-common';

@injectable() @proxyable()
class MyApiImpl implements MyApi {

    @inject(TheiaIpcRenderer)
    protected ipcRenderer: TheiaIpcRenderer;

    @proxy() myMethod() {
        // ...
    }

    protected something() {
        // ...
    }
}
```

Here only `myMethod` will be exposed by Theia's APIs when sending an instance of
`MyApi` across contexts. Note that the `protected` or `private` keywords have no
influence over what's exposed or not, only what's decorated with `@proxy()`
matters.

You may then bind your component to be exposed in the browser context:

```ts
import { bindPreloadApi } from '@theia/core/lib/electron-common';
import { ContainerModule } from '@theia/core/shared/inversify';
import { MyApi } from '../my-common';
import { MyApiImpl } from '../my-preload';

// Assuming MyApi is defined as:
const MyApi = preloadServiceIdentifier<MyApi>('MyApi');
interface MyApi {
    myMethod(): void
}

// Here is how you should bind your preload API:
export default new ContainerModule(bind => {
    bindPreloadApi(bind, MyApi).to(MyApiImpl).inSingletonScope();
});
```

Now you can inject `MyApi` from within the browser context!

Note that it is important to use `preloadServiceIdentifier()` when creating
service identifiers for your preload APIs. This function returns a string
because symbols cannot be transfered across contexts. This function also allows
you to type your service identifier so that Inversify may type check your
bindings.

### Browser Context

This context is the regular browser environment. You cannot use Electron APIs
from this context but you can use any API exposed by the preload context.

## Exposing APIs to the main world

Theia offers the `TheiaContextBridge` API to expose objects to the main world.
The difference with Electron's `contextBridge` API lies in the ability to expose
`@proxyable()` instances.

## Communication using channels

Electron proposes various APIs to do communication and it often involves
"channels". These APIs are often limited when it comes to type checking: There
is nothing to make sure you don't send a number when the other side expects a
string.

In order to adress this typing issue, Theia offers an API used by several
components: `IpcChannel`.

### `IpcChannel`

These objects are handles carrying both type information about the channel as
well as the actual channel name used when sending messages. Here's how you'd
create channels:

```ts
import { createIpcChannel, createIpcNamespace } from '@theia/core/lib/electron-common';

// Create a single channel:
const myChannel = createIpcChannel<() => void>('myChannelName');

// Create several "namespaced" channels:
const myNamespace = createIpcNamespace('myNamespaceName', channel => ({
    sendString: channel<(message: string) => void>(),
    requestData: channel<(id: number) => Promise<string>>(),
    syncChannel: channel<() => string>()
}));

// You can then access channels within the namespace:
myNamespace.sendString; // IpcChannel
myNamespace.requestData; // IpcChannel
myNamespace.syncChannel; // IpcChannel
```

Namespaces are a useful way to group channels belonging to a same abstraction
together while avoiding naming collisions with other channels. The `IpcChannels`
it creates are formed as `{namespaceName}.{channelName}`.

## Communication between preload and browser contexts

While you may communicate between the preload and browser contexts using the
exposed APIs seen earlier in this document, using these APIs comes at a cost:
Calls are sync which means that execution threads are paused until the messages
for request/response are passed around contexts.

If you wish to do asynchronous communication Theia offers an API:
`TheiaIpcWindow`.

### `TheiaIpcWindow`

This component is wired to communicate between the browser and preload contexts
specifically.

It emulates a channel-based communication over the window's `postMessage` API.
This means that you might receive messages belonging to this communication when
listening for the `message` event on the window.

This component uses `IpcChannel` references to ensure typing is correct when
sending and handling messages.

## Communication between preload and main contexts

Electron offers the `ipcRenderer` and `ipcMain` APIs in order to communicate
between your preload and main contexts. But these APIs are lacking type
checking, which means that nothing prevents you from expecting to receive a
string but send a number.

Theia proposes APIs for typed IPC communication: `TheiaIpcRenderer` and
`TheiaIpcMain`.

### `TheiaIpcRenderer` and `TheiaIpcMain`

These APIs are typed abstractions around Electron's `ipcRenderer` and `ipcMain`
APIs. They take `IpcChannel` references as channel parameter and then type check
the arguments you wish to send and receive. If typing gets in your way, feel
free to fallback to Electron's raw APIs.

Note that these components implement a few more functions than Electron does,
for convenience (and internal use).

Here's an example usage of `TheiaIpcMain` to handle messages sent from the
preload context to the main context:

```ts
import { inject, injectable } from 'inversify';
import { TheiaIpcMain, TheiaIpcMainEvent } from '../electron-common';
import { ElectronMainApplicationContribution } from '@theia/core/lib/electron-main';

const sendSomeId = createIpcChannel<(someId: number) => void>();
const broadcastChannel = createIpcChannel<(data: unknown) => void>();
const responseChannel = createIpcChannel<(data: unknown) => void>();

@injectable()
export class MyApiMain implements ElectronMainApplicationContribution {

    @inject(TheiaIpcMain)
    protected ipcMain: TheiaIpcMain;

    onStart(): void {
        // We pass "this" as last argument to make sure the method is bound,
        // otherwise you might get "Cannot read properties of undefined..." errors:
        this.ipcMain.on(sendSomeId, this.onMyChannel, this);
    }

    onMyChannel(event: TheiaIpcMainEvent, someId: number): void {
        // Do things with someId
        // ...
        // We can also send a message to a specific webContent:
        this.ipcMain.sendTo(event.sender, responseChannel, { ... });
        // Or broadcast to every webContents:
        this.ipcMain.sendAll(broadcastChannel, { ... });
    }
}
```
