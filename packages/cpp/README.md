# Theia - Cpp Extension

This extension uses [Clangd](https://clang.llvm.org/extra/clangd.html) to
provide LSP features.

To install Clangd on Ubuntu 18.04:

    $ wget -O - https://apt.llvm.org/llvm-snapshot.gpg.key | sudo apt-key add -
    $ echo "deb http://apt.llvm.org/bionic/ llvm-toolchain-bionic main" | sudo tee /etc/apt/sources.list.d/llvm.list
    $ sudo apt-get update && sudo apt-get install -y clang-tools-8
    $ sudo ln -s /usr/bin/clangd-8 /usr/bin/clangd

See [here](https://clang.llvm.org/extra/clangd.html#id4) for detailed installation instructions.

To get accurate diagnostics, it helps to...

1. ... have the build system of the C/C++ project generate a
   [`compile_commands.json`](https://clang.llvm.org/docs/JSONCompilationDatabase.html)
   file and...
2. ... point Clangd to the build directory containing said
   `compile_commands.json`.

\#2 can be done using the `cpp.buildConfigurations` preference.  In your home
or your project `.theia/settings.json`, define one or more build
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

You can then select an active configuration using the
`C/C++: Change Build Configuration` command from the command palette.

## C/C++ Debugging

In order to use the C/C++ Debugger and correctly attach to a program, you need to have GDB
installed on your system. Also make sure that your OS configuration allows you to attach to
processes. One way to troubleshoot this is to try and use GDB and see if it works: `gdb -p <pid>`.
If something went wrong GDB might tell you the instructions to follow.

Under Ubuntu it would require you to set `/proc/sys/kernel/yama/ptrace_scope` to 0:

```sh
echo 0 | sudo tee /proc/sys/kernel/yama/ptrace_scope
```

## License
- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)
