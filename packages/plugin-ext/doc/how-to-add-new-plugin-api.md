# Basic architecture overview
![Theia Plugin API](https://user-images.githubusercontent.com/436777/37775864-5cf856d0-2de4-11e8-8f55-2b5a5de72908.png)

## Plugin runtime
Plugin runtime is a JavaScript runtime for Theia plugins, for now we have two types of the runtime:

1. WebWorker - for frontend plugins
2. Separate Node.JS instance - for backend plugins


# plugin-ext structure

[api](./src/api) - protocol and model objects for communication between Theia client and plugins runtime

[main](./src/main) - Theia part if plugin API. Code inside this directory is simple Theia extension and can use all functionality provided by Theia like `inversify`;

[plugin](./src/plugin) - Plugin runtime part of the Plugin API. Here place for all types and namespaces described in [theia.d.ts](../../plugin/src/theia.d.ts)

# How to add new Plugin API

1. Add new method/namespace to [theia.d.ts](../../plugin/src/theia.d.ts). You can copy from `vscode.d.ts` or provide your own.

