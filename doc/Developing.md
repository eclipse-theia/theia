This file contains tips to help you take (and understand) your first steps in
the world of Theia development.  Are you in a hurry?  See the [tl;dr](#tldr).

# How to build Theia and the example applications

Theia is a framework to build IDEs, so you can't really "run" Theia itself.
However, you can run the example applications included in its repository.  One
is a browser-based IDE and the other is the electron-based equivalent.

## Prerequisites
* node.js/npm
* git

So far it has been confirmed that there are some problems and errors using nodejs 8.0+ and npm 5.0+ with theia. As of now, nodejs 7.10.0 and npm 4.2.0 are confirmed to be working well and are the currently recommended versions.

[nvm](https://github.com/creationix/nvm) is recommended to easily switch between node versions.

## Clone the repository

    git clone https://github.com/theia-ide/theia

The directory containing the Theia repository will now be referred to as
`$THEIA`, so if you want to copy-paste the examples, you can set the `THEIA`
variable in your shell:

    THEIA=$PWD/theia

## Build core, extensions and examples packages

You can download dependencies and build it using:

    cd $THEIA
    npm install

This command does a few things:

 - downloads npm package dependencies
 - generate package.json for node packages
 - link core, extensions and examples packages
 - build core, extensions and examples packages

## Run the browser-based example application

We can start the application from the examples/browser directory with:

    npm start

This command starts the backend application, a small web server and a browser
tab with the frontend.

If you rebuild native node packages for electron then 
rollback these changes before starting the browser example
by running from the root directory:

    npm run rebuild:browser

## Run the electron-based example application

From the root directory run:

    npm run rebuild:electron

This command rebuilds native node packages against the version of node used by electron.

It can also be started from the examples/electron directory with:

    npm start

## Rebuilding

In the root directory run:

    npm run build
## Watching

### core and extension packages

To rebuild each time a change is detected run:

    npm run watch

### the examples

To rebuild each time a change is detected in frontend or backend you can run:

    npm run watch

## Debugging

To debug an example using VSCode:

### Debug the browser example's backend

- Start the debug tab and run the `Launch Backend` configuration.

### Debug the browser example's frontend

- Start the frontend using `npm run start:frontend`
- In a browser: open http://localhost:8080/ and use the dev tools for debugging
- In VS Code: start the debug tab and run the `Launch Frontend` configuration.

### Debug the browser example's frontend and backend at the same time

- create a symlink to theia directory `ln -s theia theia-frontend`
- Open one vscode in theia directory.
- Open another vscode in theia-frontend directory.
- In one vscode window: start the debug tab and run the `Launch Backend` configuration.
- In the other vscode window: start the debug tab and run the `Launch Frontend`
  configuration.

### Debug the electron example

This one you can build as usual with `npm run build` and then use Chrome's
dev tools to debug.

There's an issue debugging with vscode it seems electron runs at 100% and
debugging doesn't work.

### Issues

Note that we should be able to debug both frontend and backend in one window but I've this
[this issue](https://github.com/Microsoft/vscode/issues/28817) when trying
that. tl;dr Some breakpoints don't hit.

## tl;dr

To build and run the browser example:

    git clone https://github.com/theia-ide/theia \
    && cd theia \
    && npm install --unsafe-perm \
    && cd examples/browser \
    && npm run start

To build and run the electron example:

    git clone https://github.com/theia-ide/theia \
    && cd theia \
    && npm install --unsafe-perm \
    && npm run rebuild:electron \
    && cd examples/electron \
    && npm run start

## Code coverage

    npm run test

If you would like to check the generated code coverage report

    firefox coverage/index.html

## Troubleshooting

### Linux

The npm start command will start a watcher on many files in the theia
directory. To avoid ENOSPC errors, increase your default inotify watches.

It can be done like so:

    echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p

### Windows

Theia uses native modules and also requires Python 2.x to be installed on the system when building the application.
 - One can get all the [all-in-one packages] by running `npm install --global windows-build-tools` script.

 If you are facing with `EPERM: operation not permitted` or `permission denied` errors while building, testing or running the application then;
 - You don't have write access to the installation directory.
 - Try to run your command line (`PowerShell`, `GitBash`, `Cygwin` or whatever you are using) as an administrator.
 - The permissions in the NPM cache might get corrupted. Please try to run `npm cache clean` to fix them.
 - If you experience issues such as `Error: EBUSY: resource busy or locked, rename`, try to disable (or uninstall) your anti-malware software. See [here](https://github.com/npm/npm/issues/13461#issuecomment-282556281).
 - Still having issues on Windows? File a [bug]. We are working on Linux or OS X operating systems. Hence we are more than happy to receive any Windows related feedbacks, bug reports.

[all-in-one packages]: https://github.com/felixrieseberg/windows-build-tools
[bug]: https://github.com/theia-ide/theia/issues
