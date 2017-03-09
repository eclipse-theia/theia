import { Disposable } from "./disposable";
import { injectable, multiInject } from "inversify";

export interface Command {
    id: string;
    execute(arg?: any): any;
    label(arg?: any): string;
    iconClass(arg?: any): string;
    isVisible(arg?: any): boolean;
    isEnabled(arg?: any): boolean;
}

export const CommandContribution = Symbol("CommandContribution");

export interface CommandContribution {
    getCommands(): Command[];
}

@injectable()
export class CommandRegistry {

    private commands:Command[];

    constructor( @multiInject(CommandContribution) commandContributions: CommandContribution[]) {
        this.commands = [];
        for (let contrib of commandContributions) {
            for (let command of contrib.getCommands()) {
                this.registerCommand(command);
            }
        }
    }

    registerCommand(command: Command): Disposable {
        this.commands.push(command);
        return {
            dispose() {
                this.commands = this.commands.filter((e:Command) => e !== command);
            }
        }
    }

    getCommands() : Command[] {
        return this.commands;
    }
}

export class SimpleCommand implements Command {
    constructor(private opts: SimpleCommand.Options) {
    }

    get id(): string {
        return this.opts.id;
    }

    execute(arg?: any) : Promise<any> {
        if (this.opts.execute) {
            return Promise.resolve(this.opts.execute());
        }
        return Promise.resolve();
    }

    label(arg?: any): string {
        return this.opts.label;
    }

    iconClass(arg?: any): string {
        return this.opts.iconClass ? this.opts.iconClass : '';
    }
    isVisible(arg?: any): boolean {
        return true;
    }
    isEnabled(arg?: any): boolean {
        if (this.opts.isEnabled) {
            return this.opts.isEnabled();
        }
        return true;
    }

}
export namespace SimpleCommand {
    export class Options {
        id: string
        label:string
        iconClass?:string
        execute?: ()=>void
        isEnabled?: ()=>boolean
    }
}