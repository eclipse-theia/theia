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
- [**Testing**](#testing)
  - [**Enabling tests**](#enabling-tests)
  - [**Writing tests**](#writing-tests)
  - [**Running tests**](#running-tests)
  - [**Configuring tests**](#configuring-tests)
  - [**Inspecting tests**](#inspecting-tests)
  - [**Reporting test coverage**](#reporting-test-coverage)

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


## Testing

### Enabling tests

First enable `expose-loader` in `webpack.config.js`
to expose modules from bundled code to tests
by uncommenting:

```js
/**
 * Expose bundled modules on window.theia.moduleName namespace, e.g.
 * window['theia']['@theia/core/lib/common/uri'].
 * Such syntax can be used by external code, for instance, for testing.
config.module.rules.push({
    test: /\.js$/,
    loader: require.resolve('@theia/application-manager/lib/expose-loader')
}); */
```

After that run `theia build` again to expose modules in generated bundle files.

### Writing tests

See [API integrationg testing](../../doc/api-testing.md) docs.

### Running tests

To start the backend server and run API tests against it:

    theia test

After running test this command terminates. It accepts the same arguments as `start` command,
but as well additional arguments to specify test files, enable inspection or generate test coverage.

### Configuring tests

To specify test files:

    theia test . --test-spec=./test/*.spec.js --plugins=./plugins

This command starts the application with a current directory as a workspace,
load VS Code extensions from `./plugins`
and run test files matching `./test/*.spec.js` glob.

Use `theia test --help` to learn more options. Test specific options start with `--test-`.

### Inspecting tests

To inspect tests:

    theia test . --test-spec=./test/*.spec.js --test-inspect --inspect

This command starts the application server in the debug mode 
as well as open the Chrome devtools to debug frontend code and test files.
One can reload/rerun code and tests by simply reloading the page.

> Important! Since tests are relying on focus, while running tests keep the page focused.

### Reporting test coverage

To report test coverage:

    theia test . --test-spec=./test/*.spec.js --test-coverage

This command executes tests and generate test coverage files consumable by istanbyl.
