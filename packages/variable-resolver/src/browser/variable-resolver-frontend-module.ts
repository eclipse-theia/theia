/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { ContainerModule } from '@theia/core/shared/inversify';
import { bindContributionProvider, CommandContribution } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { VariableRegistry, VariableContribution } from './variable';
import { VariableQuickOpenService } from './variable-quick-open-service';
import { VariableResolverFrontendContribution } from './variable-resolver-frontend-contribution';
import { VariableResolverService } from './variable-resolver-service';
import { CommonVariableContribution } from './common-variable-contribution';

export default new ContainerModule(bind => {
    bind(VariableRegistry).toSelf().inSingletonScope();
    bind(VariableResolverService).toSelf().inSingletonScope();
    bindContributionProvider(bind, VariableContribution);

    bind(VariableResolverFrontendContribution).toSelf().inSingletonScope();
    for (const identifier of [FrontendApplicationContribution, CommandContribution]) {
        bind(identifier).toService(VariableResolverFrontendContribution);
    }

    bind(VariableQuickOpenService).toSelf().inSingletonScope();

    bind(CommonVariableContribution).toSelf().inSingletonScope();
    bind(VariableContribution).toService(CommonVariableContribution);
});
