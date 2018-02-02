# Benefits and issues with using Domterm

See [home page](http://domterm.org) and
[this introductory article](https://opensource.com/article/18/1/introduction-domterm-terminal-emulator) for more information.

## Benefits

Better vt*nnn*/xterm compatibility, as demonstrated by the [vttest testsuite](https://invisible-island.net/vttest/vttest.html).

You can embed graphics, html text, and more in the output.
For example help text can be rich html text.
(`domterm help` by default emits rich text on DomTerm.)

Output folding (show/hide byttons).

Compiler and other error messages (of the form FILE:LINE) are clickable.
(Needs hooking up for theia.)

Move cursor in bash or other readline-based program with mouse.
(Requires setting of special escape sequences in prompt.)

Builtin LISP-style pretty-printer with re-flow on window re-size.

Optional line-editing for program that don't have readline or similar.
(Potentially could use Monaco key-bindings and edit actions.)

Optional built-in pager (like `less`).

## Issues

A styling problem with the scroll-bar - it's almost invisible.

Should set DOMTERM environment variable.  That requires domterm-version.js.

## Using domterm program

The domterm program (see [build instructions](http://domterm.org/Downloading-and-building.html))
provides a number of useful features beyond just starting a terminal emulator.
For example the `domterm imgcat` sub-command lets you "print"
an image to the current terminal.
This and similar "client" sub-commands work.

The "server-side" features of the domterm program could be
re-implemented in typescript/node, but it may make more sense
to use the domterm command itself from theia.  That gives us
a lot of features already impleted: Session management (attach/save/detach);
handling of clicked links; flow control; watching and parsing the
`setting.ini' preferences file (a more friendly syntax that JSON).

Communication between the DomTerm JavaScript code and the domterm
program usea a WebSocket, so it seems reasonable to provide
a mode for the theia terminal to use the domterm program.
