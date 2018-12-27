# Theia - Task Extension

This extension permits executing scripts or binaries in Theia's backend.

Tasks launch configurations can be defined independently for each workspace, under `.theia/tasks.json`. When present, they are automatically picked-up when a client opens a workspace, and watches for changes. A task can be executed by triggering the "Run Task" command (shortcut F1). A list of known tasks will then be available, one of which can be selected to trigger execution.

Each task configuration looks like this:
``` json
{
    "label": "Test task - list workspace files recursively",
    "type": "shell",
    "cwd": "${workspaceFolder}",
    "command": "ls",
    "args": [
        "-alR"
    ],
    "windows": {
        "command": "cmd.exe",
        "args": [
            "/c",
            "dir",
            "/s"
        ]
    }
}
```

*label*: a unique string that identifies the task. That's what's shown to the user, when it's time to chose one task configuration to run.

*type*: determines what type of process will be used to execute the task. Can be "process" or "shell". "Shell" processes' output can be shown in Theia's frontend, in a terminal widget. If type set as "process" then task will be run without their output being shown.

*cwd*: the current working directory, in which the task's command will execute. This is the equivalent of doing a "cd" to that directory, on the command-line, before running the command. This can contain the variable *${workspaceFolder}*, which will be replaced at execution time by the path of the current workspace. If left undefined, will by default be set to workspace root.

*command*: the actual command or script to execute. The command can have no path (e.g. "ls") if it can be found in the system path. Else it can have an absolute path, in which case there is no confusion. Or it can have a relative path, in which case it will be interpreted to be relative to cwd. e.g. "./task" would be interpreted to mean a script or binary called "task", right under the workspace root directory.

*args*: a list of strings, each one being one argument to pass to the command.

*windows*: by default, *command* and *args* above are used on all platforms. However it's not always possible to express a task in the same way, both on Unix and Windows. The command and/or arguments may be different, for example. If a task needs to work on both Linux/MacOS and Windows, it can be better to have two separate process options. If *windows* is defined, it will be used instead of *command* and *args*, when a task is executed on a Windows backend.

Here is a sample tasks.json that can be used to test tasks. Just add this content under the theia source directory, in directory `.theia`:
``` json
{
    // Some sample Theia tasks
    "tasks": [
        {
            "label": "[Task] short running test task (~3s)",
            "type": "shell",
            "cwd": "${workspaceFolder}/packages/task/src/node/test-resources/",
            "command": "./task",
            "args": [
                "1",
                "2",
                "3"
            ],
            "windows": {
                "command": "cmd.exe",
                "args": [
                    "/c",
                    "task.bat",
                    "abc"
                ]
            }
        },
        {
            "label": "[Task] long running test task (~300s)",
            "type": "shell",
            "cwd": "${workspaceFolder}/packages/task/src/node/test-resources/",
            "command": "./task-long-running",
            "args": [],
            "windows": {
                "command": "cmd.exe",
                "args": [
                    "/c",
                    "task-long-running.bat"
                ]
            }
        },
        {
            "label": "[Task] recursively list files from workspace root",
            "type": "shell",
            "cwd": "${workspaceFolder}",
            "command": "ls",
            "args": [
                "-alR"
            ],
            "windows": {
                "command": "cmd.exe",
                "args": [
                    "/c",
                    "dir",
                    "/s"
                ]
            }
        },
        {
            "label": "[Task] Echo a string",
            "type": "shell",
            "cwd": "${workspaceFolder}",
            "command": "bash",
            "args": [
                "-c",
                "echo 1 2 3"
            ]
        }
    ]
}
```

## Variables substitution
The variables are supported in the following properties, using `${variableName}` syntax:
- `cwd`
- `command`
- `args`
- `windows.command`
- `windows.args`

See [here](https://www.theia-ide.org/doc/index.html) for a detailed documentation.

## Contribution points
The extension provides contribution points:
- `browser/TaskContribution` - allows an extension to provide its own Task format and/or to provide the Tasks programmatically to the system
```typescript
export interface TaskContribution {
    registerResolvers?(resolvers: TaskResolverRegistry): void;
    registerProviders?(providers: TaskProviderRegistry): void;
}
```
- `node/TaskRunnerContribution` - allows an extension to provide its own way of running/killing a Task
```typescript
export interface TaskRunnerContribution {
    registerRunner(runners: TaskRunnerRegistry): void;
}
```

## License
- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)
