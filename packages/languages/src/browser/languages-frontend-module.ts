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
import { bindContributionProvider, CommandContribution } from '@theia/core/lib/common';
import { ResourceContextKey } from '@theia/core/lib/browser/resource-context-key';
import { FrontendApplicationContribution, KeybindingContribution, QuickOpenContribution, WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { Window } from './language-client-services';
import { WindowImpl } from './window-impl';
import { LanguageClientFactory } from './language-client-factory';
import { LanguagesFrontendContribution } from './languages-frontend-contribution';
import { LanguageClientContribution } from './language-client-contribution';
import { WorkspaceSymbolCommand } from './workspace-symbols';
import { LanguageClientProvider } from './language-client-provider';
import { LanguageClientProviderImpl } from './language-client-provider-impl';
import { LanguageContribution } from '../common';
import { LanguageResourceContextKey } from './language-resource-context-key';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(Window).to(WindowImpl).inSingletonScope();

    bind(LanguageClientFactory).toSelf().inSingletonScope();
    bind(LanguageContribution.Service).toDynamicValue(({ container }) =>
        WebSocketConnectionProvider.createProxy(container, LanguageContribution.servicePath)
    ).inSingletonScope();

    bindContributionProvider(bind, LanguageClientContribution);
    bind(LanguagesFrontendContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(LanguagesFrontendContribution);
    bind(CommandContribution).toService(LanguagesFrontendContribution);

    bind(WorkspaceSymbolCommand).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, KeybindingContribution, QuickOpenContribution]) {
        bind(identifier).toService(WorkspaceSymbolCommand);
    }

    bind(LanguageClientProviderImpl).toSelf().inSingletonScope();
    bind(LanguageClientProvider).toService(LanguageClientProviderImpl);

    bind(LanguageResourceContextKey).toSelf().inSingletonScope();
    rebind(ResourceContextKey).to(LanguageResourceContextKey).inSingletonScope();
});
