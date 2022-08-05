# Code Organization

The code is fully implemented in [TypeScript](https://github.com/microsoft/typescript). Within the top level folders, which organize code by functional package, we separate between the following platforms:

- `common/*`: Source code that only requires basic JavaScript APIs and runs in all target environments.
- `browser/*`: Source code that requires the `browser` APIs like access to the DOM.
  - May use code from: `common`.
- `node/*`: Source code that requires [`nodejs`](https://nodejs.org) APIs.
  - May use code from: `common`.
- `electron-node/*`: Electron specific source code that requires [`nodejs`](https://nodejs.org) APIs.
  - May use code from: `common`, `node`.
- `electron-browser/*`: Source code that requires the [Electron renderer process](https://github.com/atom/electron/tree/master/docs#modules-for-the-renderer-process-web-page) APIs.
  - May use code from: `common`, `browser`.
- `electron-main/*`: Source code that requires the [Electron main process](https://github.com/atom/electron/tree/master/docs#modules-for-the-main-process) APIs.
  - May use code from: `electron-node`, `common`, `node`.