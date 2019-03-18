/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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
import { LanguageServerContribution } from '@theia/languages/lib/node';
import { CppContribution } from './cpp-contribution';
import { CppBuildConfigurationServer, cppBuildConfigurationServerPath } from '../common/cpp-build-configuration-protocol';
import { CppBuildConfigurationServerImpl } from './cpp-build-configuration-server';
import { JsonRpcConnectionHandler, ConnectionHandler, ILogger } from '@theia/core/lib/common';

export default new ContainerModule(bind => {
    bind(LanguageServerContribution).to(CppContribution).inSingletonScope();

    bind(ILogger).toDynamicValue(ctx => {
        const logger = ctx.container.get<ILogger>(ILogger);
        return logger.child('cpp');
    }).inSingletonScope().whenTargetNamed('cpp');

    bind(CppBuildConfigurationServerImpl).toSelf().inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<CppBuildConfigurationServer>(cppBuildConfigurationServerPath, () =>
            ctx.container.get<CppBuildConfigurationServer>(CppBuildConfigurationServerImpl))
    ).inSingletonScope();
});
