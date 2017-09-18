# Theia Generator

## Getting started

In the generator-theia directory:

- `yarn`
- `yarn link` to link `generator-theia` as a global module

In the example root directory:
- `yo theia:browser` to generate the browser app
- `yo theia:electron` to generate the electron app

Overwrite all existing files if any.

## Providing extensions

A node package can declare several extensions via `theiaExtensions` property in `package.json`:

```json
{
    "theiaExtensions": [{
      "frontend": "lib/myExtension/browser/myextension-frontend-module",
      "backend": "lib/myExtension/node/myextension-backend-module",
    }, {
      "frontend": "lib/myExtension2/browser/myextension2-browser-module",
      "frontendElectron": "lib/myExtension2/electron-browser/myextension2-electron-browser-module",
      "backend": "lib/myExtension2/node/myextension2-node-module",
      "backendElectron": "lib/myExtension2/electron-main/myextension2-electron-main-module"
    }]
}
```

Each extension can consist of the following modules:
- `frontend` is used in the browser env and as well in the electron if `frontendElectron` is not provided
- `frontendElectron` is used in the electron env
- `backend` is used in the node env and as well in the electron env if `backendElectron` is not provided
- `backendElectron` is used in the electron env

An extension module should have a default export of `ContainerModule | Promise<ContainerModule>` type.

## Consuming extensions

A node package should contain `theia.package.json` listing node packages providing extensions as dependencies.
Theia generator based on `theia.package.json` generates `package.json` as well as other artifacts corresponding to the env.

## Configuring the generator

The generator can be configured in the file `.yo-rc.json`. It is generated once in the directory from where you run `yo` if it doesn't exist. 

### Working with local packages

If you are referring to local packages (which are not fetched from npm), e.g. in a `lerna` setup, list them as `localDependencies`, e.g.

```
{
  "generator-theia": {
    "localDependencies": {
      "@theia/core": "../theia/packages/core"
    }
  }
}
```

### Lookup path for node_modules

If you are referring to local packages (which are not fetched from npm), e.g. in a `lerna` setup, you can override the relative path to the `node_modules` where they are located, e.g.

```
{
  "generator-theia": {
    "node_modules": "../node_modules"
  }
}
```

### Setting a copyright header

```
{
  "generator-theia": {
    "copyright": "/*\n * Copyright (C) 2017 TypeFox and others.\n *\n */"
  }
}
```

