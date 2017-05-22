This file contains tips to help you take (and understand) your first steps in
the world of Theia development.  Are you in a hurry?  See the [tl;dr](#tldr).

# How to build Theia and the example applications

Theia is a framework to build IDEs, so you can't really "run" Theia itself.
However, you can run the example applications included in its repository.  One
is a browser-based IDE and the other is the electron-based equivalent.

## Clone the repository

    git clone https://github.com/theia-ide/theia

The directory containing the Theia repository will now be referred to as
`$THEIA`, so if you want to copy-paste the examples, you can set the `THEIA`
variable in your shell:

    THEIA=$PWD/theia

## Build the `theia` package

The top-level directory contains the `theia` npm, the Theia framework.  You can
fetch its dependencies and build it using:

    cd $THEIA
    npm install

This command does a few things:

 - downloads npm package dependencies
 - compiles Typescript files to Javascript
 - runs the Typescript linter
 - runs the unit tests

## Build and run the browser-based example application

Now that the `theia` package is built, we can do the same with the browser
example.

    cd $THEIA/examples/browser
    npm install

Note that because of the dependency that the example has on `file:../.., the
`prepare` step of `theia` will be called, causing its build process to run
again. This is expected.

Once this is done, we can start the application with:

    npm start

This command starts the backend application, a small web server and a browser
tab with the frontend.

## Build and run the electron-based example application

Building the electron-based example is similar:

    cd $THEIA/examples/electron
    npm install

It can also be started with:

    npm start

## tl;dr

To build and run the browser example:

    git clone https://github.com/theia-ide/theia \
    && cd theia \
    && npm install \
    && npm run build \
    && cd examples/browser \
    && npm install \
    && npm run build \
    && npm run start

To build and run the electron example:

    git clone https://github.com/theia-ide/theia \
    && cd theia \
    && npm install \
    && npm run build \
    && cd examples/electron \
    && npm install \
    && npm run build \
    && npm run start

## Code coverage

    npm run coverage

If you would like to check the generated code coverage report

    firefox coverage/index.html

## Troubleshooting

### Windows

Theia uses native modules and also requires Python 2.x to be installed on the system when building the application.
 - One can get all the [all-in-one packages] by running `npm install --global windows-build-tools` script.

 If you are facing with `EPERM: operation not permitted` or `permission denied` errors while building, testing or running the application then;
 - You don't have write access to the installation directory.
 - Try to run your command line (`PowerShell`, `GitBash`, `Cygwin` or whatever you are using) as an administrator.
 - The permissions in the NPM cache might get corrupted. Please try to run `npm cache clean` to fix them.
 - Still having issues on Windows? File a [bug]. We are working on Linux or OS X operating systems. Hence we are more than happy to receive any Windows related feedbacks, bug reports.

[all-in-one packages]: https://github.com/felixrieseberg/windows-build-tools
[bug]: https://github.com/theia-ide/theia/issues