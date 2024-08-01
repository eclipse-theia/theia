// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { AIVariableContribution } from '@theia/ai-core';
import { ContainerModule } from '@theia/core/shared/inversify';
import { RAG_SERVICE_PATH, RagService } from '../common';
import { RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { GLSPVariableContribution } from './glsp-variable-provider';

export default new ContainerModule(bind => {
    bind(RagService).toDynamicValue(ctx => {
        const provider = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        return provider.createProxy<RagService>(RAG_SERVICE_PATH);
    }).inSingletonScope();
    bind(AIVariableContribution).to(GLSPVariableContribution).inSingletonScope();
});
