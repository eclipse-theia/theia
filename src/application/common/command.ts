import { Disposable } from "./disposable";
import { injectable, multiInject } from "inversify";

export interface Command {
    id: string;
    label: string;
    iconClass?: string;
}
export interface CommandHandler {
    execute(arg?: any): any;
    isEnabled(arg?: any): boolean;
    isVisible?(arg?: any): boolean;
}

export const CommandContribution = Symbol("CommandContribution");

export interface CommandContribution {
    contribute(registry: CommandRegistry): void;
}

@injectable()
export class CommandRegistry {

    private _commands: { [id: string]: Command };
    private _handlers: { [id: string]: CommandHandler[] };

    constructor( @multiInject(CommandContribution) commandContributions: CommandContribution[]) {
        this._commands = {};
        this._handlers = {};
        for (let contrib of commandContributions) {
            contrib.contribute(this);
        }
        //TODO sanity check
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

    registerHandler(commandId: string, handler: CommandHandler): Disposable {
        let handlers = this._handlers[commandId];
        if (!handlers) {
            this._handlers[commandId] = handlers = [];
        }
        handlers.push(handler);
        return {
            dispose: () => {
                let idx = handlers.indexOf(handler);
                if (idx >= 0) {
                    handlers.splice(idx, 1);
                }
            }
        }
    }

    getActiveHandler(commandId: string): CommandHandler | undefined {
        const handlers = this._handlers[commandId];
        if (handlers) {
            for (let handler of handlers) {
                if (handler.isEnabled()) {
                    return handler;
                }
            }
        }
        return undefined;
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

    getCommand(id: string): Command | undefined {
        return this._commands[id];
    }

    get commandIds(): string[] {
        return Object.keys(this._commands);
    }
}
