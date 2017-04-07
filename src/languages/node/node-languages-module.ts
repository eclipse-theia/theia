import * as http from "http";
import { ContainerModule, injectable, inject, multiInject } from "inversify";
import { createConnection } from "vscode-languageserver";
import { FileSystem, Path } from '../../filesystem/common';
import { ExpressContribution } from '../../application/node';
import { openSocket } from '../../messaging/node';
import { SocketMessageReader, SocketMessageWriter } from "../../messaging/common";
import { DisposableCollection } from '../../application/common';
import { LanguageContributor } from "./language-contributor";
import { LanguageConnectionHandler } from "./language-connection-handler";

export const nodeLanguagesModule = new ContainerModule(bind => {
    bind<ExpressContribution>(ExpressContribution).to(LanguagesExpressContribution);
});

@injectable()
export class LanguagesExpressContribution implements ExpressContribution {

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @multiInject(LanguageContributor) protected readonly contributors: LanguageContributor[]
    ) {
    }

    onStart(server: http.Server): void {
        this.fileSystem.toUri(Path.ROOT).then(rootUri => {
            const handler = new LanguageConnectionHandler(server, rootUri, this.contributors);
            openSocket(handler, socket => {
                const messageReader = new SocketMessageReader(socket);
                const messageWriter = new SocketMessageWriter(socket);
                const connection = createConnection(messageReader, messageWriter);

                const toDisposeOnClose = new DisposableCollection();
                toDisposeOnClose.push(connection);
                socket.onClose(() => toDisposeOnClose.dispose());
                toDisposeOnClose.push(handler.onConnection(connection));
            });
        })
    }

}
