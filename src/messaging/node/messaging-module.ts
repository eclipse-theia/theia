import * as http from "http";
import * as ws from "ws";
import {ContainerModule, injectable, multiInject} from "inversify";
import {ExpressContribution} from "../../application/node";
import {createServerWebSocketConnection} from "../../messaging/node";
import {ConnectionHandler} from "../common";

export const messagingModule = new ContainerModule(bind => {
    bind<ExpressContribution>(ExpressContribution).to(MessagingContribution);
});

@injectable()
export class MessagingContribution implements ExpressContribution {

    constructor(@multiInject(ConnectionHandler) protected readonly handlers: ConnectionHandler[]) {
    }

    onStart(server: http.Server): void {
        for (const handler of this.handlers) {
            const path = handler.path;
            const wss = new ws.Server({
                server, path,
                perMessageDeflate: false
            });
            createServerWebSocketConnection(wss, connection => handler.onConnection(connection));
        }
    }

}
