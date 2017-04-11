import { createConnection } from '../../messaging/common/connection';
import * as http from 'http';
import { MessageConnection, RequestType } from 'vscode-jsonrpc';
import { ContainerModule, injectable, multiInject } from "inversify";
import { ExpressContribution } from '../../application/node';
import { openSocket } from '../../messaging/node';
import { SocketMessageReader, SocketMessageWriter, ConnectionHandler } from "../../messaging/common";
import { LanguageContribution } from "./language-contribution";
import { LANGUAGES_WS_PATH } from "../common";

export const nodeLanguagesModule = new ContainerModule(bind => {
    bind<ExpressContribution>(ExpressContribution).to(LanguagesExpressContribution);
});

@injectable()
export class LanguagesExpressContribution implements ExpressContribution {

    constructor(
        @multiInject(LanguageContribution) protected readonly contributors: LanguageContribution[]
    ) {
    }

    onStart(server: http.Server): void {
        // FIXME separater language registry from language contribution
        for (const contribution of this.contributors) {
            const path = `${LANGUAGES_WS_PATH}/${contribution.id}`;
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

export interface LanguageDescription {
    path: string
    // TODO: metadata
}

export interface LanguagesResult {
    languages: LanguageDescription[]
}

export namespace GetLanguagesRequest {
    export const type = new RequestType<void, LanguagesResult, void, void>('languages/getLanguages');
}

@injectable()
export class LanguagesConnectionHandler implements ConnectionHandler {

    readonly path = LANGUAGES_WS_PATH;

    constructor(
        @multiInject(LanguageContribution) protected readonly contributors: LanguageContribution[]
    ) {
    }

    onConnection(connection: MessageConnection): void {
        connection.onRequest(GetLanguagesRequest.type, () => {
            return {
                languages: this.contributors.map(contribution => {
                    return {
                        path: this.path + '/' + contribution.id
                    }
                })
            }
        });
    }

}
