/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as http from 'http';
import * as https from 'https';
import { injectable, inject, named } from "inversify";
import { createWebSocketConnection } from "vscode-ws-jsonrpc/lib/server";
import { ContributionProvider } from '@theia/core/lib/common';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { openJsonRpcSocket } from '@theia/core/lib/node';
import { LanguageServerContribution, LanguageContribution } from "./language-server-contribution";
import { ILogger } from '@theia/core/lib/common/logger';

@injectable()
export class LanguagesBackendContribution implements BackendApplicationContribution {

    constructor(
        @inject(ContributionProvider) @named(LanguageServerContribution) protected readonly contributors: ContributionProvider<LanguageServerContribution>,
        @inject(ILogger) protected logger: ILogger
    ) { }

    onStart(server: http.Server | https.Server): void {
        for (const contribution of this.contributors.getContributions()) {
            const path = LanguageContribution.getPath(contribution);
            openJsonRpcSocket({ server, path }, socket => {
                try {
                    const connection = createWebSocketConnection(socket);
                    contribution.start(connection);
                } catch (e) {
                    this.logger.error(`Error occurred while starting language contribution. ${path}.`, e);
                    socket.dispose();
                    throw e;
                }
            });
        }
    }

}
