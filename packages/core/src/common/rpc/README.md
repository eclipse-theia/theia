# RPC layer

These files define various components to handle RPC from a high-level.

The only assumptions made about transport are the following:

1. It can serialize JSON data.
2. It is asynchronous in both directions.
3. It may support synchronous messages.

The goal of this API is to be re-usable.

## RPC server API

When defining a potentially proxyable API we want to make sure the contract is
actually, well, proxyable.

Doing RPC is difficult

Now in order to get TypeScript's type system to understand this constraint, we
give you a couple utilities. See the following example:

```ts
import { Extends, Proxyable, ProxyId } from "@theia/core";

export const MyService = ProxyId("MyService");
export type MyService = Extends<_MyService, Proxyable<_MyService>>;

interface _MyService {
  myMethod(): Promise<void>;
}
```

First, we create an identifier that can be used both by Inversify and the RPC
system: `ProxyId(...)`. This returns a typed string because symbols can't be
serialized when talking with a remote.

Second, we define our actual service interface but there is a catch: We create a
"hidden" interface that we then use in the `Extends<T, Proxyable<T>>` type.

The `Proxyable<T>` type converts `T` into an RPC-friendly interface, making sure
that the various RPC naming conventions are followed. We then use the
`Extends<T, Proxyable<T>>` type in order to make sure that the result of
`Proxyable<T>` is still compatible with the original `T` type.

It may sound like a lot of trouble, but this allows TypeScript to produce
compile errors if you happen to stray from the RPC naming convention.

## RPC call context

Multiple clients may get a proxy to the same "path" on the server.

To deal with this, servers must know the context for each method call.
