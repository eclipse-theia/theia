/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

// tslint:disable:no-any

import { injectable, inject, named } from 'inversify';
import { ContributionProvider, ILogger } from '@theia/core/lib/common';
import { IConnection } from 'vscode-ws-jsonrpc/lib/server';
// tslint:disable-next-line:no-implicit-dependencies
import { ResponseError, ErrorCodes, ResponseMessage, Message, isRequestMessage } from 'vscode-jsonrpc/lib/messages';
import { InitializeRequest, ShutdownRequest } from 'vscode-languageserver-protocol';
import { MessagingService } from '@theia/core/lib/node/messaging/messaging-service';
import { LanguageContribution } from '../common';
import { LanguageServerContribution } from './language-server-contribution';

@injectable()
export class LanguagesBackendContribution implements MessagingService.Contribution, LanguageContribution.Service {

    @inject(ILogger) @named('languages')
    protected readonly logger: ILogger;

    @inject(ContributionProvider) @named(LanguageServerContribution)
    protected readonly contributors: ContributionProvider<LanguageServerContribution>;

    protected nextId: number = 1;
    protected readonly sessions = new Map<string, any>();

    async create(contributionId: string, startParameters: any): Promise<string> {
        const id = this.nextId;
        this.nextId++;
        const sessionId = String(id);
        this.sessions.set(sessionId, startParameters);
        return sessionId;
    }
    async destroy(sessionId: string): Promise<void> {
        this.sessions.delete(sessionId);
    }

    configure(service: MessagingService): void {
        for (const contribution of this.contributors.getContributions()) {
            const path = LanguageContribution.getPath(contribution);
            service.forward(path, async ({ id }: { id: string }, connection) => {
                try {
                    const parameters = this.sessions.get(id);
                    connection.onClose(() => this.destroy(id));
                    await contribution.start(connection, { sessionId: id, parameters });
                } catch (e) {
                    this.logger.error(`Error occurred while starting language contribution. ${path}.`, e);
                    this.handleStartError(e, connection);
                }
            });
        }
    }

    protected handleStartError(cause: any, connection: IConnection): void {
        connection.reader.listen((message: Message) => {
            if (isRequestMessage(message)) {
                const { method, jsonrpc, id } = message;
                if (method === InitializeRequest.type.method) {
                    const error = new ResponseError<string>(ErrorCodes.serverErrorStart, `${cause}`).toJson();
                    connection.writer.write(<ResponseMessage>{
                        jsonrpc,
                        id,
                        error
                    });
                } else if (method === ShutdownRequest.type.method) {
                    // The client expects a `null` as the response.
                    // https://microsoft.github.io/language-server-protocol/specification#shutdown
                    const data = null; // tslint:disable-line:no-null-keyword
                    connection.writer.write(<ResponseMessage>{
                        jsonrpc,
                        id,
                        data
                    });
                    // We do not dispose the `connection` here.
                    // The client contribution will do it for us on LS start-up error.
                }
            } else {
                this.logger.warn(`Ignored request message: ${message}`);
            }
        });
    }

}
