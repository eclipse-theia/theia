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

import { ContainerModule } from "inversify";
import { bindContributionProvider, CommandContribution } from '@theia/core/lib/common';
import { FrontendApplicationContribution, KeybindingContribution } from "@theia/core/lib/browser";
import { Window, WindowImpl } from '../common';
import { LanguageClientFactory } from './language-client-factory';
import { LanguagesFrontendContribution } from './languages-frontend-contribution';
import { LanguageClientContribution } from "./language-client-contribution";
import { WorkspaceSymbolCommand } from './workspace-symbols';
import { LanguageClientProvider } from './language-client-provider';
import { LanguageClientProviderImpl } from './language-client-provider-impl';

export default new ContainerModule(bind => {
    bind(Window).to(WindowImpl).inSingletonScope();

    bind(LanguageClientFactory).toSelf().inSingletonScope();

    bindContributionProvider(bind, LanguageClientContribution);
    bind(FrontendApplicationContribution).to(LanguagesFrontendContribution);

    bind(WorkspaceSymbolCommand).toSelf().inSingletonScope();
    bind(CommandContribution).toDynamicValue(ctx => ctx.container.get(WorkspaceSymbolCommand));
    bind(KeybindingContribution).toDynamicValue(ctx => ctx.container.get(WorkspaceSymbolCommand));

    bind(LanguageClientProviderImpl).toSelf().inSingletonScope();
    bind(LanguageClientProvider).toDynamicValue(ctx => ctx.container.get(LanguageClientProviderImpl)).inSingletonScope();

});
