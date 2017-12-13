# Authoring Theia Extensions

As an example, we are going to add a menu item _Say hello_ that displays a notification "Hello world!". This article is guiding you through all the necessary steps.

## Theia’s Architecture

A Theia app is composed of so called _extensions_. An extension provides a set of widgets, commands, handlers, etc. for a specific functionality. Theia itself ships a number of extensions, e.g. for editors, terminals, the project view etc. Each extension resides in its own npm package.

Theia defines a plethora of contribution interfaces that allow extensions to add their behaviour to various aspects of the application. Just search for interfaces with the name `*Contribution` to get an idea. An extension implements the contribution interfaces belonging to the functionality it wants to deliver. In this example, we are going to implement a `CommandContribution` and a `MenuContribution`. Other ways for extensions to interact with a Theia application are via one of the various _services_ or _managers_.

In Theia, everything is wired up via [dependency injection](Architecture.md#dependency-injection-di). An extension defines one ore more dependency injection modules. This is where it binds its contribution implementations to the respective contribution interface. The modules are listed in the `package.json` of the extension package. An extension can contribute to the frontend, e.g. providing a UI extension, as well as to the backend, e.g. contributing a language server. When the application starts, the union of all these modules is used to configure a single, global dependency injection container on each, the frontend and the backend. The runtime will then collect all contributions of a specific kind by means of a multi-inject.

## Prerequisites

You’ll need node in version 8:

```bash
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.5/install.sh | bash
nvm install 8
```

and yarn

```
npm install -g yarn
```

Also make sure your `python --version` points to a Python 2.x installation.

## Project Layout

We are going to create a monorepo (a repository containing multiple npm packages) named `theia-hello-world-extension` containing three packages: `hello-world-extension`, `browser-app` and `electron-app`. The first contains our extension, the latter two the Theia applications to run our extension in browser and electron mode.  We are going to use `yarn` instead of `npm`, because it allows to structure such monorepos into workspaces. In our case, each workspace contains its own `npm` package. Common dependencies of these packages are 'hoisted' by `yarn` to their common root directory. We are also going to use `lerna` to run scripts accross workspaces. 

To ease the setup of such a repository we have created a [code generator](https://www.npmjs.com/package/generator-theia-extension) to scaffold the project. It will also generate the `hello-world` example. Run it using

```bash
npm install -g yo generator-theia-extension
mkdir theia-hello-world-extension
cd theia-hello-world-extension
yo theia-extension hello-world
```

Let's have look at the generated code now. The root `package.json` defines the workspaces, the dependencies to `lerna`, `typescript`and `rimraf and some scripts to rebuild the native packages for browser or electron.

```json
{
  "private": true,
  "scripts": {
    "prepare": "lerna run prepare",
    "rebuild:browser": "theia rebuild:browser",
    "rebuild:electron": "theia rebuild:electron"
  },
  "devDependencies": {
    "lerna": "2.4.0",
    "rimraf": "latest",
    "typescript": "latest"
  },
  "workspaces": [
    "hello-world-extension", "browser-app", "electron-app"
  ]
}
```

We also got a `lerna.json` file to configure `lerna`:

```json
{
  "lerna": "2.4.0",
  "version": "0.1.0",
  "useWorkspaces": true,
  "npmClient": "yarn",
  "command": {
    "run": {
      "stream": true
    }
  }
}
```

## Implementing the Extension

Next let's look at the generated code for our extension in the `hello-world-extension` folder. Let’s start with the `package.json`. It specifies the package’s metadata, its dependencies to the (bleeding edge) theia core package, a few scripts and dev dependencies, and the theia-extensions.

The keyword `theia-extension` is important: It allows a Theia app to identify and install Theia extensions from `npm`.

```json
{
  "name": "hello-world-extension",     
  "keywords": [
    "theia-extension"
  ],
  "version": "0.1.0",
  "files": [
    "lib",
    "src"
  ],
  "dependencies": {     
    "@theia/core": "next"
  },
  "scripts": {
    "prepare": "yarn run clean && yarn run build",
    "clean": "rimraf lib",
    "build": "tsc",
    "watch": "tsc -w"
  },
  "theiaExtensions": [
    {
      "frontend": "lib/browser/hello-world-frontend-module"
    }
  ]
}
```

The last property `theiaExtensions` is where we list the JavaScript modules that export the DI modules defining the contribution bindings of our extension. In our case, we only provide a frontend capability (a command and a menu entry). Analogously, you could also define contributions to the backend, e.g. a language contribution with a language server.

In the frontend module we export a default object that is a [InversifyJS `ContainerModule`](https://github.com/inversify/InversifyJS/blob/master/wiki/container_modules.md) with bindings for a command contribution and a menu contribution.

```typescript
export default new ContainerModule(bind => {
    // add your contribution bindings here
    bind(CommandContribution).to(HelloWorldCommandContribution);
    bind(MenuContribution).to(HelloWorldMenuContribution);
});
```

A command is a plain data structure defining an ID and a label. The behaviour of a command is implemented by registering a handler to its ID in a command contribution. The generator has already added a command and a handler that shows a "Hello World!" message. 

```typescript
export const HelloWorldCommand = {
    id: 'HelloWorld.command',
    label: "Shows a message"
};

@injectable()
export class HelloWorldCommandContribution implements CommandContribution {

    constructor(
        @inject(MessageService) private readonly messageService: MessageService,
    ) { }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(HelloWorldCommand);
        registry.registerHandler(HelloWorldCommand.id, {
            execute: (): any => {
                this.messageService.info('Hello World!');
                return null;
            },
            isEnabled: () => true
        });
    }
}
...
```

Note how we use `@inject` in the constructor to get the `MessageService` as a property, and how we use that later in the implementation of the handler. This is the elegance of dependency injection: As a client, we neither care where these dependencies come from nor what their lifecycle is.

To make it accessible by the UI, we implement a `MenuContribution`, adding an item to the Search/Replace section of the edit menu in the menu bar.

```typescript
...
@injectable()
export class HelloWorldMenuContribution implements MenuContribution {

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction([
            MAIN_MENU_BAR,
            CommonMenus.EDIT_MENU,
            CommonMenus.EDIT_MENU_FIND_REPLACE_GROUP
        ], {
                commandId: HelloWorldCommand.id,
                label: 'Say Hello'
            });
    }
}
```

## Executing the Extension In the Browser

Now we want to see our extension in action. For this purpose, the generator has created a `package.json` in the folder `browser-app`. It defines a Theia browser application with a couple of statically included extensions, including our `hello-world-extension`. All remaining files in this directory have been auto-generated by `yarn` calling the `theia-cli` tool during the build, as defined in the scripts section.

```json
{
  "name": "browser-app",
  "version": "0.1.0",
  "dependencies": {
    "@theia/core": "next",
    "@theia/filesystem": "next",
    "@theia/workspace": "next",
    "@theia/preferences": "next",
    "@theia/navigator": "next",
    "@theia/process": "next",
    "@theia/terminal": "next",
    "@theia/editor": "next",
    "@theia/languages": "next",
    "@theia/markers": "next",
    "@theia/monaco": "next",
    "@theia/typescript": "next",
    "hello-world-extension": "0.1.0"
  },
  "devDependencies": {
    "@theia/cli": "next"
  },
  "scripts": {
    "prepare": "theia build",    
    "start": "theia start",
    "watch": "theia build --watch"
  },
  "theia": {
    "target": "browser"
  }
}
```

Now we have all pieces together to build and run the application. 
To run the browser app, enter:

```bash
cd browser-app
yarn start <path to workspace>
```

and point your browser to http://localhost:3000. Then choose _Edit > Say Hello_ from the menu: A message "Hello World!" should pop up.

## Executing the Extension In Electron

The `package.json` for the Electron app looks almost the same, except for the name and the target property.

```json
{
  "name": "electron-app",
  ...
  "theia": {
    "target": "electron"
  }
}
```

Before running the electron app, you additionally have to rebuild some native modules:

```bash
yarn rebuild:electron
cd electron-app
yarn start <path to workspace>
```

## Deploying the Extension

If you want to make your extension publicly available, we recommend to publish it to npm. This can be achieved by calling `yarn publish` from the extension package's directory. Of course you need a valid account for that. 
