This file contains tips to help you take (and understand) your first steps in
the world of Theia development. Are you in a hurry? See the
[Quick Start](#quick-start).

# How to build Theia and the example applications
Theia is a framework to build IDEs, so you can't really "run" Theia itself.
However, you can run the example applications included in its repository. One
is a browser-based IDE and the other is the Electron-based equivalent.

The following instructions are for Linux and macOS.

For Windows instructions [click here](#building-on-windows).

 - [**Prerequisites**](#prerequisites)
 - [**Quick Start**](#quick-start)
    - [Run with SSL](#run-the-browser-example-with-ssl)
 - [**Clone the repository**](#clone-the-repository)
 - [**The repository structure**](#the-repository-structure)
 - [**Build core, extensions and examples packages**](#build-core-extensions-and-examples-packages)
 - [**Build extension packages individually**](#build-extension-packages-individually)
 - [**Run the browser-based example application**](#run-the-browser-based-example-application)
 - [**Run the Electron-based example application**](#run-the-electron-based-example-application)
 - [**Rebuilding**](#rebuilding)
 - [**Watching**](#watching)
     - [Watch the core and extension packages](#watch-the-core-and-extension-packages)
     - [Watch the examples](#watch-the-examples)
     - [Watch a specific package](#watch-a-specific-package)
     - [Watch a specific package and its local upstream dependencies](#watch-a-specific-package-and-its-local-upstream-dependencies)
 - [**Debugging**](#debugging)
     - [Debug the browser example's backend](#debug-the-browser-examples-backend)
     - [Debug the browser example's frontend](#debug-the-browser-examples-frontend)
     - [Debug the browser example's frontend and backend at the same time](#debug-the-browser-examples-frontend-and-backend-at-the-same-time)
     - [Debug the Electron example's backend](#debug-the-electron-examples-backend)
     - [Debug the Electron example's frontend](#debug-the-electron-examples-frontend)
     - [Debug IPC servers](#debug-ipc-servers)
 - [**Testing**](#testing)
 - [**Code coverage**](#code-coverage)
 - [**Building on Windows**](#building-on-windows)
 - [**Troubleshooting**](#troubleshooting)
     - [Linux](#linux)
     - [Windows](#windows)
     - [macOS](#macos)
     - [Root privileges errors](#root-privileges-errors)

## Prerequisites
 - Node.js v8.0 or higher
 - [Yarn package manager](https://yarnpkg.com/en/docs/install) v1.7.0
 - git (If you would like to use the Git-extension too, you will need to have git version 2.11.0 or higher.)

[nvm](https://github.com/creationix/nvm) is recommended to easily switch between
Node.js versions.

## Quick Start

To build and run the browser example:

    git clone https://github.com/theia-ide/theia \
    && cd theia \
    && yarn \
    && cd examples/browser \
    && yarn run start

Start your browser on http://localhost:3000.

To build and run the Electron example:

    git clone https://github.com/theia-ide/theia \
    && cd theia \
    && yarn \
    && yarn run rebuild:electron \
    && cd examples/electron \
    && yarn run start

### Run the browser example with SSL

To run the browser example using SSL use:

    git clone https://github.com/theia-ide/theia \
    && cd theia \
    && yarn \
    && cd examples/browser \
    && yarn run start --ssl --cert /path/to/cert.crt --certkey /path/to/certkey.key

Start your browser on https://localhost:3000.

## Clone the repository

    git clone https://github.com/theia-ide/theia

The directory containing the Theia repository will now be referred to as
`$THEIA`, so if you want to copy-paste the examples, you can set the `THEIA`
variable in your shell:

    THEIA=$PWD/theia

## The repository structure

Theia repository has multiple folders:

 - `packages` folder contains runtime packages, as the core package and extensions to it
 - `dev-packages` folder contains devtime packages
    - [@theia/cli](../dev-packages/cli/README.md) is a command line tool to manage Theia applications
    - [@theia/ext-scripts](../dev-packages/ext-scripts/README.md) is a command line tool to share scripts between Theia runtime packages
 - `examples` folder contains example applications, both Electron-based and browser-based
 - `doc` folder provides documentation about how Theia works
 - `scripts` folder contains JavaScript scripts used by npm scripts when
installing
- the root folder lists dev dependencies and wires everything together with [Lerna](https://lernajs.io/)

## Build core, extensions and examples packages

You can download dependencies and build it using:

    cd $THEIA
    yarn

This command downloads dev dependencies, links and builds all packages.
To learn more and understand precisely what's going on, please look at scripts in [package.json](../package.json).

## Build extension packages individually

From the root:

 `npx run build @theia/package-name`

From the package:

`yarn --ignore-scripts && yarn build`

## Run the browser-based example application

We can start the application from the [examples/browser](../examples/browser) directory with:

    yarn run start

This command starts the backend application listening on port `3000`. The frontend application should be available on http://localhost:3000.

If you rebuild native Node.js packages for Electron then rollback these changes
before starting the browser example by running from the root directory:

    yarn run rebuild:browser

## Run the Electron-based example application

From the root directory run:

    yarn run rebuild:electron

This command rebuilds native Node.js packages against the version of Node.js
used by Electron.

It can also be started from the [examples/electron](../examples/electron) directory with:

    yarn run start

## Rebuilding

In the root directory run:

    yarn run build

## Watching

### Watch the core and extension packages

To rebuild each time a change is detected run:

    yarn run watch

### Watch the examples

To rebuild each time a change is detected in frontend or backend you can run:

    yarn run watch

### Watch a specific package

You can use `npx` to watch a single package:

    npx run watch @theia/the-package-name

### Watch a specific package and its local upstream dependencies

Let assume you have to work for instance in the `@theia/navigator` extension. But you might have to apply changes in any of its upstream dependencies such as `@theia/filesystem` or `@theia/core`, you can either do `yarn watch` which could be super expensive, as it watches all the packages. Or you can do `npx run watch @theia/navigator` and `npx run watch @theia/filesystem` and `npx run watch @theia/core` in three individual shells. Or you can do the following single-liner:

    npx run watch @theia/navigator --include-filtered-dependencies --parallel

## Debugging

### Debug the browser example's backend

 - In VS Code: start the debug tab and run the `Launch Backend` configuration.

### Debug the browser example's frontend

 - Start the backend by using `yarn run start`.
 - In a browser: Open http://localhost:3000/ and use the dev tools for debugging.
 - In VS Code: start the debug tab and run the `Launch Frontend` configuration.

### Debug the browser example's frontend and backend at the same time

 - In VS Code: Start the debug tab and run the `Launch Backend` configuration.
 - Then run the `Launch Frontend` configuration.
 
### Debug the Electron example's backend

 - In VS Code: Start the debug tab and run the `Launch Electron Backend` configuration.

### Debug the Electron example's frontend

 - Start the backend by using `yarn run start`.
 - In Electron: Help -> Toggle Electron Developer Tools.

### Debug IPC servers

  - Pass `--${server-name}-inspect` arg to the backend server.
    - For example `--nfsw-watcher-inspect=0` to inspect nfsw watcher processes with dynamic port allocation.
    - All variations of `--inspect` flag are supported: https://nodejs.org/en/docs/inspector/#command-line-options.
  - Attach the debugger to the logged port.

In order to look up `server-name` run the backend server with `--log-level=debug` flag to enable logging of IPC servers instantiation.
You should be able to see message of `[${server-name}: ${server-PID}]: IPC started` format, like `[nsfw-watcher: 37557] IPC started`.

## Testing

See the [testing](Testing.md) documentation.

## Code coverage

    yarn run test

By default, this will generate the code coverage for the tests in an HTML
format, which can be easily viewed with your browser (Chrome/Firefox/Edge/Safari
etc.) by opening `packages/<package name>/coverage/index.html`.

## Building on Windows

Run cmd.exe as an administrator and install `choco` by copy-pasting the command
to your console:

    @"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))" && SET "PATH=%PATH%;%ALLUSERSPROFILE%\chocolatey\bin"

Install `yarn` via `choco`. The `yarn` installation ensures that you will have
Node.js and npm too:

    choco install yarn

Install `git` via `choco`

    choco install git

Install the correct version of `yarn` (The version is important)

    choco install yarn --version 1.7.0 -y

Install Windows-Build-Tools.
Run PowerShell as an administrator and copy-paste the below command:

    npm --add-python-to-path install --global --production windows-build-tools

Clone, build and run Theia.
Using Git Bash as administrator:

    git clone https://github.com/theia-ide/theia.git && cd theia && yarn && cd examples/browser && yarn run start

## Troubleshooting

### Linux

The start command will start a watcher on many files in the theia directory.
To avoid ENOSPC errors, increase your default inotify watches.

It can be done like so:

    echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p

### Windows

Theia uses native modules and also requires Python 2.x to be installed on the
system when building the application.

 - One can get all the [all-in-one packages] by running
 `npm install --global windows-build-tools` script.

 If you are facing with `EPERM: operation not permitted` or `permission denied`
errors while building, testing or running the application then;

 - You don't have write access to the installation directory.
 - Try to run your command line (`PowerShell`, `GitBash`, `Cygwin` or whatever
 you are using) as an administrator.
 - The permissions in the NPM cache might get corrupted. Please try to run
 `npm cache clean` to fix them.
 - If you experience issues such as `Error: EBUSY: resource busy or locked, rename`,
 try to disable (or uninstall) your anti-malware software.
 See [here](https://github.com/npm/npm/issues/13461#issuecomment-282556281).
 - Still having issues on Windows? File a [bug]. We are working on Linux or OS X
 operating systems. Hence we are more than happy to receive any Windows-related
 feedbacks, bug reports.

If you have accidentally installed the wrong `yarn` version, you have to remove it, then reinstall it.

 - Run PowerShell as an administrator.
 - Run: choco uninstall yarn -y
 - Run: choco install yarn --version 1.7.0 -y

[all-in-one packages]: https://github.com/felixrieseberg/windows-build-tools
[bug]: https://github.com/theia-ide/theia/issues

### macOS

You need to have the Xcode command line tools installed in order to build and run Theia. You can install the tools by running

    xcode-select --install

If you already have Xcode installed, but you see the `xcode-select: error: tool 'xcodebuild' requires Xcode, but active developer directory '/Library/Developer/CommandLineTools' is a command line tools instance` error, you need to run the following command to fix it: `sudo xcode-select --switch /Library/Developer/CommandLineTools`.
 
### Root privileges errors
When trying to install with root privileges, you might encounter errors such as
`cannot run in wd`.

Several options are available to you:

 - Install without root privileges
 - Use the `--unsafe-perm` flag: `yarn --unsafe-perm`
