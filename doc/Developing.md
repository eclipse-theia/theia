This file contains tips to help you take (and understand) your first steps in
the world of Theia development.  Are you in a hurry?  See the [tl;dr](#tldr).

# How to build Theia and the example applications

Theia is a framework to build IDEs, so you can't really "run" Theia itself.
However, you can run the example applications included in its repository.  One
is a browser-based IDE and the other is the electron-based equivalent.

## Clone the repository

    $ git clone https://github.com/theia-ide/theia

The directory containing the Theia repository will now be referred to as
`$THEIA`, so if you want to copy-paste the examples, you can set the `THEIA`
variable in your shell:

    $ THEIA=$PWD/theia

## Build the `theia` package

The top-level directory contains the `theia` npm, the Theia framework.  You can
fetch its dependencies and build it using:

    $ cd $THEIA
    $ npm install

This command does a few things:

 - downloads npm package dependencies
 - compiles Typescript files to Javascript
 - runs the Typescript linter
 - runs the unit tests

## Build the `file-dependency-updater` tool

Before building the examples, we need to build a small utility that helps
handling the dependency of the example applications on the main `theia`
package.  This tool watches for any change in the build artifacts of `theia`
and propagates them to the examples' `node_modules` directories.  It helps
keeping our edit-build-test cycle short when doing changes to `theia`.

    $ cd $THEIA/config/file-dependency-updater
    $ npm install

## Build and run the browser-based example application

Now that the `theia` package is built, we can do the same with the browser
example.

    $ cd $THEIA/examples/browser
    $ npm install

Note that because of the dependency that the example has on `file:../.., the
`prepare` step of `theia` will be called, causing its build process to run
again.  This is expected.

Once this is done, we can start the application with:

    $ npm start

This command starts the backend application, a small web server and a browser
tab with the frontend.

## Build and run the electron-based example application

Building the electron-based example is similar:

    $ cd $THEIA/examples/electron
    $ npm install

It can also be started with:

    $ npm start

## tldr

To build and run the browser example:

    $ git clone https://github.com/theia-ide/theia && \
      cd theia && \
      npm install && \
      cd examples/browser && \
      npm install && \
      npm start

To build and run the electron example:

    $ git clone https://github.com/theia-ide/theia && \
      cd theia && \
      npm install && \
      cd examples/electron && \
      npm install && \
      npm start
