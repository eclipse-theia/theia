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

import { injectable, inject, named } from "inversify";
import { ContributionProvider } from '@theia/core/lib/common';
import { LanguageServerContribution, LanguageContribution } from "./language-server-contribution";
import { ILogger } from '@theia/core/lib/common/logger';
import { MessagingService } from '@theia/core/lib/node/messaging/messaging-service';

@injectable()
export class LanguagesBackendContribution implements MessagingService.Contribution {

    @inject(ILogger) @named('languages')
    protected readonly logger: ILogger;

    @inject(ContributionProvider) @named(LanguageServerContribution)
    protected readonly contributors: ContributionProvider<LanguageServerContribution>;

    configure(service: MessagingService): void {
        for (const contribution of this.contributors.getContributions()) {
            const path = LanguageContribution.getPath(contribution);
            service.forward(path, (params, connection) => {
                try {
                    contribution.start(connection);
                } catch (e) {
                    this.logger.error(`Error occurred while starting language contribution. ${path}.`, e);
                    connection.dispose();
                    throw e;
                }
            });
        }
    }

}
