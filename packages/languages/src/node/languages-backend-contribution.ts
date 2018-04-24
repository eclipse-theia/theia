/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
