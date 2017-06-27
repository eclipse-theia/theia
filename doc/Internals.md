This file contains information about the internals of Theia. It assumes
you already know the basics about Theia's architecture as described in:
[Architecture.md](https://github.com/theia-ide/theia/blob/master/doc/Architecture.md).

* [How create a backend service and connect to it over JSON-RPC](#backendfrontend).
* [Contribution Providers](#contribution-providers).
* [Events](#events).


# <a name="backendfrontend"></a>How create a backend service and connect to it over JSON-RPC

In this section I will explain how you can create a backend service and
then connect to it over JSON-RPC.

I will use the debug logging system as a small example of that.

## Overview

This works by creating a service exposed by the express framework and
then connecting to that over a websocket connection.

## Registering a service

So the first thing you will want to do is expose your service so that the
frontend can connect to it.

You will need to create backend server module file similar to this (logger-server-module.ts):

``` typescript

import { ContainerModule } from 'inversify';
import { ConnectionHandler, JsonRpcConnectionHandler } from "../../messaging/common";
import { ILoggerServer, ILoggerClient } from '../../application/common/logger-protocol';

export const loggerServerModule = new ContainerModule(bind => {
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<ILoggerClient>("/logger", client => {
            const loggerServer = ctx.container.get<ILoggerServer>(ILoggerServer);
            loggerServer.setClient(client);
            return loggerServer;
        })
    ).inSingletonScope()
});
```

Let's go over that in detail:

``` typescript
import { ConnectionHandler, JsonRpcConnectionHandler } from "../../messaging/common";
```

This imports the `JsonRpcConnectionHandler`, this factory enables you to create
a connection handler that onConnection creates proxy object to the object that
is called in the backend over JSON-RPC and expose a local object to JSON-RPC.

We'll see more on how this is done as we go.

The `ConnectionHandler` is a simple interface that specifies the path of the
connection and what happens on connection creation.

It looks like this:

``` typescript
import { MessageConnection } from "vscode-jsonrpc";

export const ConnectionHandler = Symbol('ConnectionHandler');

export interface ConnectionHandler {
    readonly path: string;
    onConnection(connection: MessageConnection): void;
}
```

``` typescript
import { ILoggerServer, ILoggerClient } from '../../application/common/logger-protocol';
```

The logger-protocol.ts file contains the interfaces that the server and the
client need to implement.

The server here means the backend object that will be called over JSON-RPC
and the client is a client object that can receive notifications from the
backend object.

I'll get more into that later.

``` typescript
    bind<ConnectionHandler>(ConnectionHandler).toDynamicValue(ctx => {
```

Here a bit of magic happens, at first glance we're just saying here's an
implementation of a ConnectionHandler.

The magic here is that this ConnectionHandler type is bound to a
ContributionProvider in messaging-module.ts

So as the MessagingContribution starts (onStart is called) it creates a
websocket connection for all bound ConnectionHandlers.

like so (from messaging-module.ts):

``` typescript
constructor( @inject(ContributionProvider) @named(ConnectionHandler) protected readonly handlers: ContributionProvider<ConnectionHandler>) {
    }

    onStart(server: http.Server): void {
        for (const handler of this.handlers.getContributions()) {
            const path = handler.path;
            try {
                createServerWebSocketConnection({
                    server,
                    path
                }, connection => handler.onConnection(connection));
            } catch (error) {
                console.error(error)
            }
        }
    }
```

To dig more into ContributionProvider see this [section](#contribution-providers).

So now:

``` typescript
new JsonRpcConnectionHandler<ILoggerClient>("/logger", client => {
```

This does a few things if we look at this class implementation:

``` typescript
export class JsonRpcConnectionHandler<T extends object> implements ConnectionHandler {
    constructor(
        readonly path: string,
        readonly targetFactory: (proxy: JsonRpcProxy<T>) => any
    ) { }

    onConnection(connection: MessageConnection): void {
        const factory = new JsonRpcProxyFactory<T>(this.path);
        const proxy = factory.createProxy();
        factory.target = this.targetFactory(proxy);
        factory.listen(connection);
    }
}
```

We see that a websocket connection is created on path: "logger" by the extension of the ConnectionHandler class with the path attribute set to "logger".

And let's look at what it does onConnection : 

``` typescript            
    onConnection(connection: MessageConnection): void {
        const factory = new JsonRpcProxyFactory<T>(this.path);
        const proxy = factory.createProxy();
        factory.target = this.targetFactory(proxy);
        factory.listen(connection);
```


Let's go over this line by line:

``` typescript
    const factory = new JsonRpcProxyFactory<T>(this.path);
```

This creates a JsonRpcProxy on path "logger".

``` typescript
    const proxy = factory.createProxy();
```

Here we create a proxy object from the factory, this will be used to call
the other end of the JSON-RPC connection using the ILoggerClient interface.

``` typescript
    factory.target = this.targetFactory(proxy);
```

This will call the function we've passed in parameter so:

``` typescript
        client => { 
            const loggerServer = ctx.container.get<ILoggerServer>(ILoggerServer);
            loggerServer.setClient(client);
            return loggerServer;
        }
```

This sets the client on the loggerServer, in this case this is used to
send notifications to the frontend about a log level change.

And it returns the loggerServer as the object that will be exposed over JSON-RPC.

``` typescript 
 factory.listen(connection);
```

This connects the factory to the connection.

So now all is set for backend/frontend communication.

The only point left is that if you're using the webpack dev server which
you probably are you need to add something like this:

``` javascript
            '/logger/*': {
                target: 'ws://localhost:3000',
                ws: true
            },
```

To webpack.config.js so that the requests are proxied to the backend properly.

## Connecting to a service

So now that we have a backend service let's see how to connect to it from
the frontend.

To do that you will need something like this:

(From logger-frontend-module.ts)

``` typescript
import { ContainerModule, Container } from 'inversify';
import { WebSocketConnectionProvider } from '../../messaging/browser/connection';
import { ILogger, LoggerFactory, LoggerOptions, Logger } from '../common/logger';
import { ILoggerServer } from '../common/logger-protocol';
import { LoggerWatcher } from '../common/logger-watcher';

export const loggerFrontendModule = new ContainerModule(bind => {
    bind(ILogger).to(Logger).inSingletonScope();
    bind(LoggerWatcher).toSelf().inSingletonScope();
    bind(ILoggerServer).toDynamicValue(ctx => {
        const loggerWatcher = ctx.container.get(LoggerWatcher);
        const connection = ctx.container.get(WebSocketConnectionProvider);
        return connection.createProxy<ILoggerServer>("/logger", loggerWatcher.getLoggerClient());
    }).inSingletonScope();
});
```

The important bit here are those lines: 

``` typescript
    bind(ILoggerServer).toDynamicValue(ctx => {
        const loggerWatcher = ctx.container.get(LoggerWatcher);
        const connection = ctx.container.get(WebSocketConnectionProvider);
        return connection.createProxy<ILoggerServer>("/logger", loggerWatcher.getLoggerClient());
    }).inSingletonScope();

```

Let's go line by line:

``` typescript
        const loggerWatcher = ctx.container.get(LoggerWatcher);
```

Here we're creating a watcher, this is used to get notified about events
from the backend by using the loggerWatcher client
(loggerWatcher.getLoggerClient())

See more information about how events works in theia [here](events).

``` typescript
        const connection = ctx.container.get(WebSocketConnectionProvider);
```

Here we're getting the websocket connection, this will be used to create a proxy from.

``` typescript
        return connection.createProxy<ILoggerServer>("/logger", loggerWatcher.getLoggerClient());
```

So here at the last line we're binding the ILoggerServer interface to a
JsonRpc proxy.

Note that his under the hood calls:

``` typescript
 createProxy<T extends object>(path: string, target?: object, options?: WebSocketOptions): T {
        const factory = new JsonRpcProxyFactory<T>(path, target);
        this.listen(factory, options);
        return factory.createProxy();
    }
```

So it's very similar to the backend example.

Maybe you've noticed too but as far as the connection is concerned the frontend
is the server and the backend is the client. But that doesn't really
matter in our logic.

So again there's multiple things going on here what this does is that:
 - it creates a JsonRpc Proxy on path "logger".
 - it exposes the loggerWatcher.getLoggerClient() object.
 - it returns a proxy of type ILoggerServer.

So now instances of ILoggerServer are proxied over JSON-RPC to the
backend's LoggerServer object.

## Loading the modules in the example backend and frontend

So now that we have these modules we need to wire them into the example.
We will use the browser example for this, note that it's the same code for
the electron example.

### Backend

In examples/browser/src/backend/main.ts you will need something like:

``` typescript
import { loggerServerModule } from 'theia-core/lib/application/node/logger-server-module';
```

And than load that into the main container:

``` typescript
container.load(loggerServerModule);
```

### Frontend

In examples/browser/src/frontend/main.ts you will need something like:

``` typescript
import { loggerFrontendModule } from 'theia-core/lib/application/browser/logger-frontend-module';
```

``` typescript
container.load(frontendLanguagesModule);
```

## Complete example

If you wish to see the complete implementation of what I refered too in
this documentation see [this commit](https://github.com/theia-ide/theia/commit/99d191f19bd2a3e93098470ca1bb7b320ab344a1).

# Contribution Providers

A contribution provider is basically a container for contributions where
contributions are instances of a bound type.

It is very generic.

To bind a type to a contribution provider you can do like this:

(From messaging-module.ts)

``` typescript
export const messagingModule = new ContainerModule(bind => {
    bind<BackendApplicationContribution>(BackendApplicationContribution).to(MessagingContribution);
    bindContributionProvider(bind, ConnectionHandler)
});
```
The last line will bind a ContributionProvider to one that contains all
ConnectionHandler bound instances.


It is used as such:

(From messaging-module.ts)

``` typescript
    constructor( @inject(ContributionProvider) @named(ConnectionHandler) protected readonly handlers: ContributionProvider<ConnectionHandler>) {
    }

```

So here we're injecting a ContributionProvider with the named
ConnectionHandler value that was bound before by `bindContributionProvider`.

This enables anyone to bind a ConnectionHandler and now when the
messagingModule is started all the ConnectionHandlers will be initiated.

# Events

Events in Theia can be confusing, hopefully we can clarify things.

Let's consider this code:

(From logger-watcher.ts)
``` typescript
@injectable()
export class LoggerWatcher {

    getLoggerClient(): ILoggerClient {
        const emitter = this.onLogLevelChangedEmitter
        return {
            onLogLevelChanged(event: ILogLevelChangedEvent) {
                emitter.fire(event)
            }
        }
    }

    private onLogLevelChangedEmitter = new Emitter<ILogLevelChangedEvent>();

    get onLogLevelChanged(): Event<ILogLevelChangedEvent> {
        return this.onLogLevelChangedEmitter.event;
    }
}
```

Let's start with:

``` typescript
    private onLogLevelChangedEmitter = new Emitter<ILogLevelChangedEvent>();
```

So first what is an `Emitter`?

An Emitter is an event handler container,
it allows for event handlers to be registered on it and triggered with an
event of type X in this case an ILogLevelChanedEvent.

So here we just create an `Emitter` that will have events of type ILogLevelChangedEvent;

Next we want to be able to register an event handler on this `Emitter` to
do so we do this:

``` typescript
    get onLogLevelChanged(): Event<ILogLevelChangedEvent> {
        return this.onLogLevelChangedEmitter.event;
    }
```

What this actually returns is a function that will register an event
handler so you just pass it your event handler function and it will
register it so that it's called when the event fires.

so you can call:

(From logger.ts)
``` typescript
 /* Update the root logger log level if it changes in the backend. */
        loggerWatcher.onLogLevelChanged(event => {
            this.id.then(id => {
                if (id === this.rootLoggerId) {
                    this._logLevel = Promise.resolve(event.newLogLevel);
                }
            });
        });
```

This registers the anonymous function passed as param on this emitter.

Next we will need to trigger this event handler by firering an event:

``` typescript
 onLogLevelChanged(event: ILogLevelChangedEvent) {
                emitter.fire(event)
            }
```

When calling this function, the emitter fires and all the event handlers
are called.

So if you need to trigger events in theia:

 - Create an emitter
 - Register events with the emitter.event function
 - Fire events with emitter.fire(event)



