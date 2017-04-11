import { MessageConnection } from 'vscode-jsonrpc';
import { ContainerModule, injectable, inject, optional } from "inversify";
import { listen } from "../../messaging/browser";
import {
    BaseLanguageClient,
    Commands,
    ConnectionCloseHandler,
    ConnectionErrorHandler,
    createConnection,
    ILanguageClient,
    Languages,
    LANGUAGES_WS_PATH,
    OutputChannel,
    Window,
    Workspace,
    ConsoleWindow
} from '../common';
import { TheiaPlugin, TheiaApplication } from "../../application/browser";
import { ErrorAction, CloseAction } from "vscode-languageclient/lib/base";

export const browserLanguagesModule = new ContainerModule(bind => {
    bind(Window).to(ConsoleWindow).inSingletonScope();
    bind(TheiaPlugin).to(LanguagesPlugin).inSingletonScope();
});

@injectable()
export class LanguagesPlugin implements TheiaPlugin {

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(Languages) protected readonly languages: Languages,
        @inject(Commands) @optional() protected readonly commands: Commands | undefined = undefined,
        @inject(Window) @optional() protected readonly window: Window | undefined = undefined) {
    }

    onStart(app: TheiaApplication): void {
        this.workspace.ready.then(() => {
            listen({
                path: LANGUAGES_WS_PATH + '/java',
                onConnection: connection => {
                    const languageClient = this.createLanguageClient(connection);
                    const disposable = languageClient.start();
                    connection.onClose(() => disposable.dispose());
                }
            });
        });
    }

    protected createLanguageClient(connection: MessageConnection): ILanguageClient {
        const { workspace, languages, commands, window } = this;
        const fileEvents = [];
        if (workspace.createFileSystemWatcher) {
            fileEvents.push(workspace.createFileSystemWatcher("**/*.java"));
            fileEvents.push(workspace.createFileSystemWatcher("**/pom.xml"));
            fileEvents.push(workspace.createFileSystemWatcher("**/*.gradle"));
        }
        return new BaseLanguageClient({
            name: 'Java Language Client',
            clientOptions: {
                documentSelector: ['java'],
                synchronize: {
                    configurationSection: 'java',
                },
                errorHandler: {
                    error: () => ErrorAction.Continue,
                    closed: () => CloseAction.DoNotRestart
                }
            },
            services: { workspace, languages, commands, window },
            connectionProvider: {
                // FIXME get rid of outputChannel
                get: (errorHandler: ConnectionErrorHandler, closeHandler: ConnectionCloseHandler, outputChannel: OutputChannel | undefined) => {
                    return Promise.resolve(createConnection(connection, closeHandler, closeHandler));
                }
            }
        });
    }

}
