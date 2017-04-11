import * as http from 'http';
import { MessageConnection, } from 'vscode-jsonrpc';
import { ContainerModule, injectable, multiInject } from "inversify";
import { LanguageIdentifier } from '../common/languages-protocol';
import { createConnection } from '../../messaging/common/connection';
import { ExpressContribution } from '../../application/node';
import { openSocket } from '../../messaging/node';
import { SocketMessageReader, SocketMessageWriter, ConnectionHandler } from "../../messaging/common";
import { LanguageContribution } from "./language-contribution";
import { LANGUAGES_WS_PATH, GetLanguagesRequest } from "../common";

export const nodeLanguagesModule = new ContainerModule(bind => {
    bind(ConnectionHandler).to(LanguagesConnectionHandler);
    bind(ExpressContribution).to(LanguagesExpressContribution);
});

@injectable()
export class LanguagesExpressContribution implements ExpressContribution {

    constructor(
        @multiInject(LanguageContribution) protected readonly contributors: LanguageContribution[]
    ) {
    }

    onStart(server: http.Server): void {
        for (const contribution of this.contributors) {
            const path = LanguageIdentifier.create(contribution.description).path;
            openSocket({
                server,
                path
            }, socket => {
                const reader = new SocketMessageReader(socket);
                const writer = new SocketMessageWriter(socket);
                const connection = createConnection(reader, writer, () => socket.dispose());
                contribution.listen(connection);
            });
        }
    }

}

@injectable()
export class LanguagesConnectionHandler implements ConnectionHandler {

    readonly path = LANGUAGES_WS_PATH;

    constructor(
        @multiInject(LanguageContribution) protected readonly contributors: LanguageContribution[]
    ) {
    }

    onConnection(connection: MessageConnection): void {
        connection.onRequest(GetLanguagesRequest.type, (params, token) => {
            const languages = this.contributors.map(contribution =>
                LanguageIdentifier.create(contribution.description)
            )
            return {
                languages
            }
        });
        connection.listen();
    }

}
