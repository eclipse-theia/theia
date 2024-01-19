// *****************************************************************************
// Copyright (C) 2024 EclipseSource and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { HeadlessPluginContainerModule } from './common/headless-plugin-container';
import { bindHeadlessHosted, bindCommonHostedBackend } from './hosted/node/plugin-ext-headless-hosted-module';
import { bindHeadlessMain, bindBackendMain } from './main/node/plugin-ext-headless-main-module';

const backendModule = new ContainerModule((bind, unbind, isBound, rebind) => {
    bindBackendMain(bind, unbind, isBound, rebind);
    bindCommonHostedBackend(bind);
});

export default new ContainerModule(bind => {
    bind(HeadlessPluginContainerModule).toConstantValue(backendModule);
    bindHeadlessMain(bind);
    bindHeadlessHosted(bind);
});
