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
import { ContributionProvider } from '@theia/core/lib/common';
import { LanguageServerContribution } from './language-server-contribution';
import { ILogger } from '@theia/core/lib/common/logger';
import { MessagingService } from '@theia/core/lib/node/messaging/messaging-service';
import { LanguageContribution } from '../common';

@injectable()
export class LanguagesBackendContribution implements MessagingService.Contribution, LanguageContribution.Service {

    @inject(ILogger) @named('languages')
    protected readonly logger: ILogger;

    @inject(ContributionProvider) @named(LanguageServerContribution)
    protected readonly contributors: ContributionProvider<LanguageServerContribution>;

    protected readonly ids = new Map<string, number>();
    protected readonly sessions = new Map<string, any>();

    async create(contributionId: string, startParameters: any): Promise<string> {
        const id = (this.ids.get(contributionId) || 0) + 1;
        this.ids.set(contributionId, id);
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
            service.forward(path, ({ id }: { id: string }, connection) => {
                try {
                    const parameters = this.sessions.get(id);
                    connection.onClose(() => this.destroy(id));
                    contribution.start(connection, { sessionId: id, parameters });
                } catch (e) {
                    this.logger.error(`Error occurred while starting language contribution. ${path}.`, e);
                    connection.dispose();
                    throw e;
                }
            });
        }
    }

}
