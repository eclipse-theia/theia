import { LanguageDescription } from '../common/languages-protocol';
import * as cp from 'child_process';
import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc';
import { InitializeParams } from 'vscode-languageserver/lib/protocol';
import { InitializeRequest } from 'vscode-languageclient/lib/protocol';
import { isRequestMessage } from 'vscode-jsonrpc/lib/messages';
import { createConnection } from "../../messaging/common";
import { IConnection } from "../../messaging/common";

export {
    IConnection
}

export const LanguageContribution = Symbol('LanguageContribution');

export interface LanguageContribution {
    readonly description: LanguageDescription;
    listen(clientConnection: IConnection): void;
}

export function createServerProcess(serverName: string, command: string, args?: string[]): IConnection {
    const serverProcess = cp.spawn(command, args);
    serverProcess.on('error', error =>
        console.error(`Launching ${serverName} Server failed: ${error}`)
    );
    serverProcess.stderr.on('data', data =>
        console.error(`${serverName} Server: ${data}`)
    );
    const reader = new StreamMessageReader(serverProcess.stdout);
    const writer = new StreamMessageWriter(serverProcess.stdin);
    return createConnection(reader, writer, () => serverProcess.kill());
}

export function bindConnection(clientConnection: IConnection, serverConnection: IConnection): void {
    clientConnection.forward(serverConnection, message => {
        if (isRequestMessage(message)) {
            if (message.method === InitializeRequest.type.method) {
                const initializeParams = message.params as InitializeParams;
                initializeParams.processId = process.pid;
            }
        }
        return message;
    });
    serverConnection.forward(clientConnection);
    clientConnection.onClose(() => serverConnection.dispose());
    serverConnection.onClose(() => clientConnection.dispose());
}
