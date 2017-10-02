# Theia CLI

`theia` is a command line tool to manage Theia applications.

## Getting started

Install `@theia/cli` as a dev dependency in your application.

With yarn:

    yarn add @theia/cli@next --dev

With npm:

    npm install @theia/cli@next --save-dev

## Browser Commands

- `theia rm:browser` - remove the built output (`lib` folder) and the generated configurations
- `theia gen:browser` - generate configurations
- `theia cp:browser` - copy static resources to the built output
- `theia build:browser` - package the frontend code with webpack
    - arguments passed to webpack, e.g. `theia build:browser --watch` to package the frontend code incrementally
- `theia rebuild:browser` - rebuild native modules
- `theia browser` - start the backend node process
    - by default on port `3000`
    - arguments passed to node process, e.g. `theia browser --port=3001` to start the backend on port `3001`

## Electron Commands

- `theia rm:electron` - remove the built output (`lib` folder) and the generated configurations
- `theia gen:electron` - generate configurations
- `theia cp:electron` - copy static resources to the built output
- `theia build:electron` - package the frontend code with webpack
    - arguments passed to webpack, e.g. `theia build:electron --watch` to package the frontend code incrementally
- `theia rebuild:electron` - rebuild native modules
- `theia electron` - start the backend electron process
    - by default on port `localhost`
    - arguments passed to electron process, e.g. `theia electron --host=myhost` to start the backend on host `myhost`
