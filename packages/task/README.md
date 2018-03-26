# Theia - Task Extension

This extension permits executing scripts or binaries in Theia's backend. 

Tasks launch configurations can be defined independently for each workspace, under `.theia/tasks.json`. When present, they are automatically picked-up when a client opens a workspace, and watches for changes. A task can be executed by triggering the "Run Task" command (shortcut F1). A list of known tasks will then be available, one of which can be selected to trigger execution. 

Each task configuration looks like this:
``` json
     {
        "label": "Test task - list workspace files recursively",
        "processType": "terminal",
        "cwd": "$workspace",
        "processOptions": {
            "command": "ls",
            "args": [
                "-alR"
            ]
        },
        "windowsProcessOptions": {
            "command": "cmd.exe",
            "args": [
                "/c",
                "dir",
                "/s"
            ]
       }
    }
```

*label*: A unique string that identifies the task. That's what's shown to the user, when it's time to chose one task configuration to run.

*processType*: Determines what type of process will be used to execute the task. Can be "raw" or "terminal". Terminal processes can be shown in Theia's frontend, in a terminal widget. Raw processes are run without their output being shown. 

*cwd*: The current working directory, in which the task's command will execute. This is the equivalent of doing a "cd" to that directory, on the command-line, before running the command. This can contain the symbol *$workspace*, which will be replaced at execution time by the path of the current workspace. If left undefined, will by default be set to workspace root. 

*processOptions.command*: the actual command or script to execute. The command can have no path (e.g. "ls") if it can be found in the system path. Else it can have an absolute path, in which case there is no confusion. Or it can have a relative path, in which case it will be interpreted to be relative to cwd. e.g. "./task" would be interpreted to mean a script or binary called "task", right under the workspace root directory.

*processOptions.args*: a list of strings, each one being one argument to pass to the command. 

*windowsProcessOptions*: By default, *processOptions* above is used on all platforms. However it's not always possible to express a task in the same way, both on Unix and Windows. The command and/or arguments may be different, for example. If a task needs to work on both Linux/MacOS and Windows, it can be better to have two separate process options. If *windowsProcessOptions* is defined, it will be used instead of *processOptions*, when a task is executed on a Windows backend.



Here is a sample tasks.json that can be used to test tasks. Just add this content under the theia source directory, in directory `.theia`: 
``` json
{
    // Some sample Theia tasks
    "tasks": [
        {
            "label": "[Task] short running test task (~3s)",
            "processType": "terminal",
            "cwd": "$workspace/packages/task/src/node/test-resources/",
            "processOptions": {
                "command": "./task",
                "args": [
                    "1",
                    "2",
                    "3"
                ]
            },
            "windowsProcessOptions": {
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
            "processType": "terminal",
            "cwd": "$workspace/packages/task/src/node/test-resources/",
            "processOptions": {
                "command": "./task-long-running",
                "args": []
            },
            "windowsProcessOptions": {
                "command": "cmd.exe",
                "args": [
                    "/c",
                    "task-long-running.bat"
                ]
            }
        },
        {
            "label": "[Task] recursively list files from workspace root",
            "processType": "terminal",
            "cwd": "$workspace",
            "processOptions": {
                "command": "ls",
                "args": [
                    "-alR"
                ]
            },
            "windowsProcessOptions": {
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
            "processType": "terminal",
            "cwd": "$workspace",
            "processOptions": {
                "command": "bash",
                "args": [
                    "-c",
                    "echo 1 2 3"
                ]
            }
        }
    ]
}
```


See [here](https://github.com/theia-ide/theia) for other Theia documentation.

## License
[Apache-2.0](https://github.com/theia-ide/theia/blob/master/LICENSE)
