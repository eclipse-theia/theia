# Architecture

This section describes the overall architecture of Theia. 
Theia is designed to work as a native desktop application as well as in the context of a browser and a remote server. To support both situations with a single source, Theia runs in two separate processes. Those processes are called _frontend_ and _backend_ respectively and they communicate through JSON-RPC messages over websockets or REST APIs over HTTP. In the case of Electron the backend as well as the frontend run locally, while in a remote context the backend would run on a remote host.

Both the frontend and backend processes have there own dependency injection container (see below) to which extensions can contribute.

## Frontend

The frontend process represents the client and renders the UI. In the browser it simple runs in the main browser's rendering loop, while in Electron it runs in an Electron Window, which basically is a brower with additional Electron and node.js APIs. Therefore, frontend code may only access sources that depend on any API that can run in browsers.

The startup of the frontend process will first load the modules of all contributing extensions, before it obtains an instance of `FrontendApplication` from the resulting Dependency Injection (DI) container and call `start()` on it.

## Backend

 The backend process runs on Node.js. We use express as the HTTP server. The backend also serves the static code for the frontend. So the backend is started first and exposes a port to serve the frontend application to a requesting browser. For Electron we open an `Electron.BrowserWindow` which basically is a chromium with some additional Ecltraon APIs.
 For the backend Electron again provides additional API so we have the following folders.

 The startup of the backend application will first load the modules of all contributing extensions, before it obtains an instance of `BackendApplication` from the resulting DI container and call `start(portNumber)` on it.

## Separation By Platform

In an extension's top folder we have an additional layer of folders to separate by platform:

 - The `common` folder contains code that doesn't depend on any runtime.
 - The `browser` folder contains code requiring a modern browsers as a platform (DOM API).
 - The `electron-browser` folder contains frontend code that requires DOM API as well as Electron renderer-process specific APIs
 - The `node` folder contains (backend) code requiring Node.js as a platform.
 - The `node-electron` folder contains (backend) code specific for Electron.

## Dependency Injection (DI)

Theia uses the DI framework [Inversify.js](http://inversify.io/) to wire up the different components. Using DI decouples a certain component from creating its dependencies. Instead it gets them injected in when created (as parameters of a constructor). A DI container does the creation for you, based on some configuration you provide on startup through so called modules. For instance, the `Navigator` widget needs access to a `FileSystem` in order to present folders and files in a tree. The `FileSystem` itself actually is just a proxy sending JSON-RPC messages to some backend, so it needs a particular configuration and treatment. The navigator doesn't need to care as it will get injected a fully working `FileSystem` instance. Also in case we want to change the actual implementation noone needs to change any code in the navigator. Moreover, this decoupling of construction and use, allows extensions to provide their own very specific implementations of e.g. a `FileSystem` if needed. Still without touching any users of the `FileSystem`interface.

DI is not very complicated, but still we highly recommend to learn at least the basics of [Inversify.js](http://inversify.io/).

## Extensions

Theia is composed of extensions. An extension basically is an npm package, that exposes any number of DI modules (`ContainerModule`) that contribute to the creation of the initial DI container. 

_At the moment an extension is sonsumed by simply adding a dependency to the npm-package and then reference the exposed DI modules in the start up script (see [main.ts](../examples/browser/src/client/main.ts)). In the future we will automate the creation of the application, based on meta data in the `package.json` of an extension. Extensions can be installed/uninstalled at runtime, which will basically trigger a recompilation and restart._

Through a module the extension can provide bindings to types, i.e. provide services and contributions.

### Services

A service is just a binding that others could _inject_. E.g. one extension could expose the `SelectionService` so that others can get an instance injected and use it.

### Contribution-Points

If an extension wants to provide a hook for others to contribute to, they should define a _contribution-point_. A contribution-point is just an interface that many others can implement. The extension will delegate to them when needed. 
The `OpenerService`, for instance, defines a contribution point to allow others registering `OpenHandler`s. You can have alook at the code [here](../src/application/browser/opener-service.ts).

Theia comes with a long list of contribution points already. A good way to see what contribution points exists, is to do a find references on `bindContributionProvider`.
Also a relatively simple example of a contribution point can be found 
