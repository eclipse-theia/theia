/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { ContainerModule } from 'inversify';
import { bindContributionProvider, ILogger, ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core/lib/common';
import { MessagingService } from '@theia/core/lib/node/messaging/messaging-service';
import { LanguagesBackendContribution } from './languages-backend-contribution';
import { LanguageServerContribution } from './language-server-contribution';
import { LanguageContribution } from '../common';

export default new ContainerModule(bind => {
    bind(LanguagesBackendContribution).toSelf().inSingletonScope();
    bind(MessagingService.Contribution).toService(LanguagesBackendContribution);
    bind(LanguageContribution.Service).toService(LanguagesBackendContribution);
    bindContributionProvider(bind, LanguageServerContribution);

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler(LanguageContribution.servicePath, () =>
            ctx.container.get(LanguageContribution.Service)
        )
    ).inSingletonScope();

    bind(ILogger).toDynamicValue(ctx => {
        const logger = ctx.container.get<ILogger>(ILogger);
        return logger.child('languages');
    }).inSingletonScope().whenTargetNamed('languages');
});
