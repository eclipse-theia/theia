import { Disposable } from "./disposable";
import { injectable, multiInject } from "inversify";

export interface Command {
    id: string;
    label: string;
    iconClass?: string;
    execute(arg?: any): any;
    isVisible?(arg?: any): boolean;
    isEnabled?(arg?: any): boolean;
}

export const CommandContribution = Symbol("CommandContribution");

export interface CommandContribution {
    getCommands(): Command[];
}

@injectable()
export class CommandRegistry {

    private _commands: {[id: string]: Command};

    constructor( @multiInject(CommandContribution) commandContributions: CommandContribution[]) {
        this._commands = {};
        for (let contrib of commandContributions) {
            for (let command of contrib.getCommands()) {
                this.registerCommand(command);
            }
        }
    }

    registerCommand(command: Command): Disposable {
        if (this._commands[command.id]) {
            throw Error(`A command ${command.id} is already registered.`);
        }
        this._commands[command.id] = command;
        return {
            dispose: () => {
                delete this._commands[command.id];
            }
        }
    }

    get commands(): Command[] {
        let commands: Command[] = []
        for (let id of this.commandIds) {
            let cmd = this.getCommand(id);
            if (cmd) {
                commands.push();
            }
        }
        return commands;
    }

    getCommand(id: string): Command|undefined {
        return this._commands[id];
    }

    get commandIds(): string[] {
        return Object.keys(this._commands);
    }
}
