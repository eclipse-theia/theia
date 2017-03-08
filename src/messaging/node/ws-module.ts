import {ContainerModule, injectable, multiInject} from "inversify";
import * as http from "http";
import * as ws from "ws";
import {ExpressContribution} from "../../application/node";
import {createServerWebSocketConnection} from "../../messaging/node";
import {MessageConnection} from "vscode-jsonrpc";

export const MessageConnectionHandler = Symbol('MessageConnectionHandler');

export interface MessageConnectionHandler {
    readonly path: string;
    handle(connection: MessageConnection): void;
}

export const wsModule = new ContainerModule(bind => {
    bind<ExpressContribution>(ExpressContribution).to(WebSocketContribution);
});

@injectable()
export class WebSocketContribution implements ExpressContribution {

    constructor(@multiInject(MessageConnectionHandler) protected readonly handlers: MessageConnectionHandler[]) {
    }

    onStart(server: http.Server): void {
        for (const handler of this.handlers) {
            const path = handler.path;
            const wss = new ws.Server({
                server, path,
                perMessageDeflate: false
            });
            createServerWebSocketConnection(wss, connection => handler.handle(connection));
        }
    }

}
