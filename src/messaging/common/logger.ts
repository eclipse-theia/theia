import {Logger} from "vscode-jsonrpc";

export class ConsoleLogger implements Logger {
    public error(message: string): void {
        console.error(message);
    }

    public warn(message: string): void {
        console.warn(message);
    }

    public info(message: string): void {
        console.info(message);
    }

    public log(message: string): void {
        console.log(message);
    }

    public debug(message: string): void {
        console.debug(message);
    }
}
