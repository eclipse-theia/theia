/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as http from 'http';
import * as https from 'https';
import { ContainerModule, injectable, inject, named } from "inversify";
import { bindContributionProvider, ContributionProvider, ConnectionHandler } from '../../common';
import { BackendApplicationContribution } from "../backend-application";
import { createServerWebSocketConnection } from "./connection";

export const messagingBackendModule = new ContainerModule(bind => {
    bind<BackendApplicationContribution>(BackendApplicationContribution).to(MessagingContribution);
    bindContributionProvider(bind, ConnectionHandler);
});

@injectable()
export class MessagingContribution implements BackendApplicationContribution {

    constructor( @inject(ContributionProvider) @named(ConnectionHandler) protected readonly handlers: ContributionProvider<ConnectionHandler>) {
    }

    onStart(server: http.Server | https.Server): void {
        for (const handler of this.handlers.getContributions()) {
            const path = handler.path;
            try {
                createServerWebSocketConnection({
                    server,
                    path
                }, connection => handler.onConnection(connection));
            } catch (error) {
                console.error(error);
            }
        }
    }

}
