/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { bindContributionProvider, ILogger } from '@theia/core/lib/common';
import { MessagingService } from '@theia/core/lib/node/messaging/messaging-service';
import { LanguagesBackendContribution } from "./languages-backend-contribution";
import { LanguageServerContribution } from "./language-server-contribution";

export default new ContainerModule(bind => {
    bind(MessagingService.Contribution).to(LanguagesBackendContribution).inSingletonScope();
    bindContributionProvider(bind, LanguageServerContribution);

    // FIXME: get rid of it, replace by a logger per a language
    bind(ILogger).toDynamicValue(ctx => {
        const logger = ctx.container.get<ILogger>(ILogger);
        return logger.child('languages');
    }).inSingletonScope().whenTargetNamed('languages');
});
