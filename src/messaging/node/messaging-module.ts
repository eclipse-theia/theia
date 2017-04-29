/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as http from "http";
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
            try {
                createServerWebSocketConnection({
                    server,
                    path
                }, connection => handler.onConnection(connection));
            } catch (error) {
                console.error(error)
            }
        }
    }

}
