# Theia - Extension Manager

See [here](https://github.com/theia-ide/theia) for a detailed documentation.

## Theia Extension

A Theia extension is a node package declaring `theiaExtensions` property in `package.json`:

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

An extension module should have a default export of `ContainerModule | Promise<ContainerModule>` type.

## Theia Application

A Theia application is a node package listing [Theia extensions](#theia-extension) as dependencies and managed with [Theia CLI](../../dev-packages/cli/README.md).

## License
- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)