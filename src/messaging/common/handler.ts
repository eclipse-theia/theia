import {MessageConnection} from "vscode-jsonrpc";

export const ConnectionHandler = Symbol('ConnectionHandler');

export interface ConnectionHandler {
    readonly path: string;
    onConnection(connection: MessageConnection): void;
}
