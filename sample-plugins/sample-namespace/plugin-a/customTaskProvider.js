"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomTaskProvider = void 0;
const vscode = require("vscode");
class CustomTaskTerminal {
    constructor() {
        this.writeEmitter = new vscode.EventEmitter();
        this.onDidWrite = this.writeEmitter.event;
        this.closeEmitter = new vscode.EventEmitter();
        this.onDidClose = this.closeEmitter.event;
    }
    open(initialDimensions) {
        const output = 'somefile.abc:1:4: warning: the roof is on fire ';
        this.doBuild(output);
    }
    close() {
        this.writeEmitter.dispose();
        this.closeEmitter.fire(0);
        this.closeEmitter.dispose();
    }
    async doBuild(output) {
        return new Promise((resolve) => {
            this.writeEmitter.fire('Starting build...\r\n');
            this.writeEmitter.fire(output + '\r\n');
            this.close();
            resolve();
        });
    }
}
class CustomTaskProvider {
    async provideTasks() {
        return this.getTask();
    }
    resolveTask(_task) {
        return undefined;
    }
    getTask() {
        const definition = {
            type: CustomTaskProvider.type
        };
        return [new vscode.Task(definition, vscode.TaskScope.Workspace, `my custom`, CustomTaskProvider.type, new vscode.CustomExecution(async () => {
            return new CustomTaskTerminal();
        })),
        new vscode.Task(definition, vscode.TaskScope.Workspace, `my shell`, CustomTaskProvider.type, new vscode.ShellExecution('echo Shell')),
        new vscode.Task(definition, vscode.TaskScope.Workspace, `my process`, CustomTaskProvider.type, new vscode.ProcessExecution('echo Process'))];
    }
}
exports.CustomTaskProvider = CustomTaskProvider;
CustomTaskProvider.type = 'mytasktype';
//# sourceMappingURL=customTaskProvider.js.map
