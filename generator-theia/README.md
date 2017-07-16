# Theia Generator

## Getting started

In the generator-theia directory:

- `npm install`
- `npm link` to install `generator-theia` as a global module
- `npm install -g yo` to install yo globally

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

