# Architecture

This section describes the overall architecture of Theia.

Theia is designed to work as a native desktop application as well as in the
context of a browser and a remote server. To support both situations with a
single source, Theia runs in two separate processes. Those processes are called
_frontend_ and _backend_ respectively, and they communicate through JSON-RPC
messages over WebSockets or REST APIs over HTTP. In the case of Electron, the
backend, as well as the frontend, run locally, while in a remote context the
backend would run on a remote host.

Both the frontend and backend processes have their dependency injection (DI)
container (see below) to which extensions can contribute.

## Frontend

The frontend process represents the client and renders the UI. In the browser,
it simply runs in the rendering loop, while in Electron it runs in an Electron
Window, which basically is a browser with additional Electron and Node.js APIs.
Therefore, any frontend code may assume browser as a platform but not Node.js.

The startup of the frontend process will first load the DI modules of all
contributing extensions before it obtains an instance of `FrontendApplication`
and call `start()` on it.

## Backend

The backend process runs on Node.js. We use _express_ as the HTTP server. It
may not use any code that requires a browser (DOM API) as the platform.

The startup of the backend application will first load the DI modules of all
contributing extensions before it obtains an instance of `BackendApplication`
and calls `start(portNumber)` on it.

By default the backend's express server also serves the code for the frontend.

## Separation By Platform

In an extension's top folder we have an additional layer of folders to separate
by platform:

 - The `common` folder contains code that doesn't depend on any runtime.
 - The `browser` folder contains code requiring a modern browser as a platform
   (DOM API).
 - The `electron-browser` folder contains frontend code that requires DOM API
   as well as Electron renderer-process specific APIs.
 - The `node` folder contains (backend) code requiring Node.js as a platform.
 - The `node-electron` folder contains (backend) code specific for Electron.

## Dependency Injection (DI)

Theia uses the DI framework [Inversify.js](http://inversify.io/) to wire up the
different components.

DI decouples a components from creating its dependencies. Instead, it gets them
injected on creation (as parameters of a constructor). A DI container does the
creation for you, based on some configuration you provide on startup through
so-called container modules.

For instance, the `Navigator` widget needs access to a `FileSystem` to present
folders and files in a tree. With DI the concretion of that `FileSystem`
interface is not important to the `Navigator` widget. It can safely assume that
an object consistent with the `FileSystem` interface is ready to use. In Theia,
the used `FileSystem` concretion is just a proxy sending JSON-RPC messages to
the backend, so it needs a particular configuration and treatment. The
navigator doesn't need to care as it will get injected a fully working
`FileSystem` instance.

Moreover, this decoupling of construction and use, allows extensions to provide
their very specific implementations of e.g. a `FileSystem` if needed. Still
without touching any users of the `FileSystem` interface.

DI is an integral part of Theia. Therefore, we highly recommend learning at
least the basics of [Inversify.js](http://inversify.io/).

## Extensions

Theia is composed of extensions. An extension is an npm package that exposes
any number of DI modules (`ContainerModule`) that contribute to the creation of
the DI container.

_At the moment an extension is consumed by adding a dependency to the
npm-package and then reference the exposed DI modules in the startup script
(see [main.ts](../examples/browser/src/client/main.ts)). In the future, we will
automate the creation of the application, based on metadata in the
`package.json` of an extension. Extensions can be installed/uninstalled at
runtime, which will trigger a recompilation and restart._

Through a DI module, the extension can provide bindings from types to concrete
implementations, i.e. provide services and contributions.

### Services

A service is just a binding for other components to use. For instance, one
extension could expose the `SelectionService` so that others can get an
instance injected and use it.

### Contribution-Points

If an extension wants to provide a hook for others to contribute to, they
should define a _contribution-point_. A _contribution-point_ is just an
interface that many others can implement. The extension will delegate to them
when needed.

The `OpenerService`, for instance, defines a contribution point to allow others
registering `OpenHandler`s. You can have a look at the code
[here](../src/application/browser/opener-service.ts).

Theia comes with an extensive list of contribution points already. A good way
to see what contribution points exist is to do a find references on
`bindContributionProvider`.
