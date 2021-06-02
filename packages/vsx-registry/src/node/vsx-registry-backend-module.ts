/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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
import { VSXExtensionResolver } from './vsx-extension-resolver';
import { PluginDeployerResolver } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { VSXRegistryAPI } from '../common/vsx-registry-api';
import { VSXEnvironment } from '../common/vsx-environment';
import { VSXApiVersionProviderImpl } from './vsx-api-version-provider-backend-impl';
import { VSXApiVersionProvider } from '../common/vsx-api-version-provider';

export default new ContainerModule(bind => {
    bind(VSXEnvironment).toSelf().inRequestScope();
    bind(VSXRegistryAPI).toSelf().inSingletonScope();

    bind(VSXExtensionResolver).toSelf().inSingletonScope();
    bind(PluginDeployerResolver).toService(VSXExtensionResolver);

    bind(VSXApiVersionProviderImpl).toSelf().inSingletonScope();
    bind(VSXApiVersionProvider).toService(VSXApiVersionProviderImpl);
});
