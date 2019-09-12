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

## Using the clang-tidy linter

**Note: This functionality is available when using clangd 9 and later.**

You can set the preference 'cpp.clangTidy' to enable the clang-tidy linter included in clangd. When the preference is enabled, there are two ways to choose which of its built-in checks clang-tidy will use:

- using the preferences:  'cpp.clangTidyChecks'
- using the file '.clang-tidy' . This file is located in the same folder of the files or a parent folder.

**Note**: When the preference setting for "cpp.clangTidyChecks" is set, the configs will be merged with the configuration found in the ".clang-tidy" file. If you want to drop the configs from ".clang-tidy", you'd need to disable it in "cpp.clangTidyChecks" with **"cpp.clangTidyChecks": "-*"**.

The syntax used to fill the checks can be found at http://clang.llvm.org/extra/clang-tidy/

clang-tidy has its own checks and can also run Clang static analyzer checks. Each check has a name ([see link above for full list](http://clang.llvm.org/extra/clang-tidy/)). Clang-tidy takes as input the checks that should run, in the form of a comma-separated list of positive and negative (prefixed with -) globs. Positive globs add subsets of checks, negative globs remove them.

There are two ways to configure clang-tidy's checks: through a Theia preference or using a .clang-tidy config file. Here are examples for both:"

    - for the preferences: "cpp.clangTidyChecks": "*,-readability-*"
        - Meaning: enables all list-checks and disable all readability-* checks

    - for the .clang-tidy file: Checks: "-*,readability-*"
        - Meaning: disable all list-checks and enable all readability-* checks

### Running clang-tidy as a task

To be able to run clang-tidy as a task, you need to install the program.

```bash
UNIX
    sudo apt-get install clang-tidy
Note: not all operating system are currently supported with this linter yet.
```

```
The clang-tidy task will read the "checks" and other configuration fields from the ".clang-tidy" file located in the closest parent directory of the source file.
P.S. You do not need to provide a value for each field.

Those configurations fields can be:
    Checks
    CheckOptions
    FormatStyle
    HeaderFilterRegex
    User
    WarningsAsErrors

You can run the following command to have an idea of the fields found in file ".clang-tidy"
    clang-tidy -dump-config
```

In .theia/tasks.json, add the following:

```json
   {
        "label": "[Task] clang-tidy",
        "type": "shell",
        "cwd": "${workspaceFolder}",
        "command": "clang-tidy",
        "args": [
            "*"
        ],
        "options": {},
        "problemMatcher": [
            "$clangTidyMatcher"
        ]
   }
```

If you want a description for each task field, see [theia/packages/task/src/browser/task-schema-updater.ts]( https://github.com/eclipse-theia/theia/blob/531aa3bde8dea7f022ea41beaee3aace65ce54de/packages/task/src/browser/task-schema-updater.ts#L62 )

```bash
When there is no compilation database, clang-tidy could run but you may need to be more specific which files to select. One way is to replace the "args" from the "*" to
"**/*.cpp" to only parse files with the "cpp" extension or
"**/*.c" to parse the "c" files extension.
```

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)
