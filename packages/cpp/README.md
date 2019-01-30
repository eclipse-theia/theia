# Theia - Cpp Extension

This extension uses [Clangd](https://clang.llvm.org/extra/clangd.html) to
provide LSP features.

To install Clangd on Ubuntu 18.04:

    $ wget -O - https://apt.llvm.org/llvm-snapshot.gpg.key | sudo apt-key add -
    $ echo "deb http://apt.llvm.org/bionic/ llvm-toolchain-bionic main" | sudo tee /etc/apt/sources.list.d/llvm.list
    $ sudo apt-get update && sudo apt-get install -y clang-tools-8
    $ sudo ln -s /usr/bin/clangd-8 /usr/bin/clangd

See [here](https://clang.llvm.org/extra/clangd.html#id4) for detailed
installation instructions.

## Getting accurate diagnostics

To get accurate diagnostics, it helps to:

1. Have the build system of the C/C++ project generate a
   [`compile_commands.json`](https://clang.llvm.org/docs/JSONCompilationDatabase.html)
   file.
2. Point Clangd to the build directory containing said `compile_commands.json`.

Step \#2 can be done using the `cpp.buildConfigurations` preference. In your
home or your project `.theia/settings.json`, define one or more build
configurations:

    {
        "cpp.buildConfigurations": [{
            "name": "Release",
            "directory": "/path/to/my/release/build"
        },{
            "name": "Debug",
            "directory": "/path/to/my/debug/build"
        }]
    }

You can then select an active configuration using the `C/C++: Change Build
Configuration` command from the command palette.

## Setting clangd executable path and arguments

The path of the clangd executable to use can be specified by either:

- Setting the `CPP_CLANGD_COMMAND` environment variable
- Setting the `cpp.clangdExecutable` preference in your home or your project
  `.theia/settings.json`:

        {
            "cpp.clangdExecutable": "/path/to/my/clangd/executable"
        }

- Adding clangd to system path. Default value of executable path is set to
  `clangd`

Similarly, the command-line arguments passed to clangd can be specified by
either:

- Setting the `CPP_CLANGD_ARGS` environment variable
- Setting the `cpp.clangdArgs` preference in your home or your project
  `.theia/settings.json`:

        {
            "cpp.clangdArgs": "list of clangd arguments"
        }

## Getting cross-file references to work

You may notice that by default, cross-references across source file boundaries
don't work.  For example, doing a "Go To Definition" on a function defined in a
different source file (different `.c` or `.cpp`) doesn't work, instead it sends
you to the declaration of the function, typically in a header file.

To get this working, you need to enable clangd's global index using the
`--background-index` command-line argument.

        {
            "cpp.clangdArgs": "--background-index"
        }

## License
- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)
