# Theia CLI

`theia` is a command line tool to manage Theia applications.

- [**Getting started**](#getting-started)
- [**Configure**](#configure)
  - [**Build Target**](#build-target)
  - [**Using latest builds**](#using-latest-builds)
- [**Building**](#building)
- [**Rebuilding native modules**](#rebuilding-native-modules)
- [**Running**](#running)
- [**Debugging**](#debugging)

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
    },
    "dependencies": {
        "@theia/electron": "latest"
    }
}
```

For `electron` target make sure to install required Electron runtime dependenices. The easiest way is to install `@theia/electron` package.

### Using latest builds

If you set `next` in your theia config, then Theia will prefer `next` over `latest` as the latest tag.

```json
{
    "theia": {
        "next": "true"
    }
}
```

## Building

To build once:

    theia build --mode development

In order to rebuild on each change:

    theia build --watch --mode development

To build for production:

    theia build

In order to clean up the build result:

    theia clean

Arguments are passed directly to [webpack](https://webpack.js.org/), use `--help` to learn which options are supported.

## Rebuilding native modules

In order to run electron one should rebuild native node modules for an electron version:

    theia rebuild

To rollback native modules change the target to `browser` and run the command again.

## Running

To run the backend server:

    theia start

For the browser target a server is started on http://localhost:3000 by default.
For the electron target a server is started on `localhost` host with the dynamically allocated port by default.

Arguments are passed directly to a server, use `--help` to learn which options are supported.

## Debugging

To debug the backend server:

    theia start --inspect

Theia CLI accepts `--inspect` node flag: https://nodejs.org/en/docs/inspector/#command-line-options.
