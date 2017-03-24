import {Logger} from "vscode-jsonrpc";

export class ConsoleLogger implements Logger {

    error(message: string): void {
        console.log(message);
    }

    warn(message: string): void {
        console.log(message);
    }

    info(message: string): void {
        console.log(message);
    }

    log(message: string): void {
        console.log(message);
    }

}
