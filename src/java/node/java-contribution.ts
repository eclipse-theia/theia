import { InitializeParams } from 'vscode-languageserver/lib/protocol';
import { InitializeRequest } from 'vscode-languageclient/lib/protocol';
import { isRequestMessage } from 'vscode-jsonrpc/lib/messages';
import * as path from 'path';
import * as cp from 'child_process';
import { injectable } from "inversify";
import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc';
import { LanguageContribution } from "../../languages/node";
import { IConnection, createConnection } from "../../messaging/common";

export type ConfigurationType = 'config_win' | 'config_mac' | 'config_linux';
export const configurations = new Map<typeof process.platform, ConfigurationType>();
configurations.set('darwin', 'config_mac');
configurations.set('win32', 'config_win');
configurations.set('linux', 'config_linux');

@injectable()
export class JavaContribution implements LanguageContribution {

    readonly id = 'java';

    listen(clientConnection: IConnection): void {
        const projectPath = path.resolve(__dirname, '../../..');
        const serverPath = path.resolve(projectPath, '../eclipse.jdt.ls/org.eclipse.jdt.ls.product/target/repository');
        const jarPath = path.resolve(serverPath, 'plugins/org.eclipse.equinox.launcher_1.4.0.v20161219-1356.jar');
        const workspacePath = path.resolve(projectPath, '../../ws');
        const configuration = configurations.get(process.platform);
        const configurationPath = path.resolve(serverPath, configuration);
        const command = 'java';
        const args = [
            '-Declipse.application=org.eclipse.jdt.ls.core.id1',
            '-Dosgi.bundles.defaultStartLevel=4',
            '-Declipse.product=org.eclipse.jdt.ls.core.product',
            '-Dlog.protocol=true',
            '-Dlog.level=ALL',
            '-noverify',
            '-Xmx1G',
            '-jar', jarPath,
            '-configuration', configurationPath,
            '-data', workspacePath
        ];
        const serverProcess = cp.spawn(command, args);
        serverProcess.on('error', error => {
            console.error('Launching Java Server failed: ' + error);
        });
        serverProcess.stderr.on('data', data => {
            console.error('Java Server: ' + data)
        });
        const reader = new StreamMessageReader(serverProcess.stdout);
        const writer = new StreamMessageWriter(serverProcess.stdin);
        const serverConnection = createConnection(reader, writer, () => serverProcess.kill());
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
        serverConnection.onClose(() => clientConnection.dispose())
    }

}
