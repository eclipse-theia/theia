# Theia CLI

`theia` is a command line tool to manage Theia applications.

## Getting started

Install `@theia/cli` as a dev dependency in your application.

With yarn:

    yarn add @theia/cli@next --dev

With npm:

    npm install @theia/cli@next --save-dev

## Configure

A Theia application is configured via `theia` property in package.json.

### Build Target

The following targets are supported: `browser` and `electron`. By default `browser` target is used.
The target can be configured in package.json via `theia/target` property, e.g:

```json
{
    "theia": {
        "target": "electron"
    }
}
```

### Using latest builds

If you set `next` in your theia config, then Theia will prefer `next` over `latest` as the lattest tag.

```json
{
    "theia": {
        "next": "true"
    }
}
```

## Run

- `theia clean` - remove the built output (`lib` folder) and the generated configurations
- `theia generate` - generate configurations for the given target
- `theia copy` - copy static resources to the built output
- `theia build` - package the frontend code with webpack
    - arguments passed to webpack, e.g. `theia build --watch` to package the frontend code incrementally
- `theia rebuild` - rebuild native modules for the given target
- `theia start` - start the backend node or electron process
    - by default on port `3000` for the browser target
    - by default on host `localhost` for the electron target
    - arguments passed to a backend process, e.g. `theia start --port=3001` to start the backend on port `3001`
