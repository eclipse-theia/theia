// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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
import { BackendApplicationContribution, BackendApplicationServer } from '@theia/core/lib/node';
import { SampleBackendApplicationServer } from './sample-backend-application-server.js';
import { SampleMockOpenVsxServer } from './sample-mock-open-vsx-server.js';
import { SampleAppInfo } from '../common/vsx/sample-app-info.js';
import { SampleBackendAppInfo } from './sample-backend-app-info.js';
import { rebindOVSXClientFactory } from '../common/vsx/sample-ovsx-client-factory.js';
import { ConnectionHandler, PreferenceContribution, RpcConnectionHandler } from '@theia/core';
import { FileWatchingPreferencesSchema } from '../common/preference-schema.js';
import { MCPBackendContribution } from '@theia/ai-mcp-server/lib/node/mcp-theia-server';
import { MCPTestContribution } from './sample-mcp-test-contribution.js';
import { SampleBackendPreferencesService, sampleBackendPreferencesServicePath } from '../common/preference-protocol.js';
import { SampleBackendPreferencesBackendServiceImpl } from './sample-backend-preferences-service.js';
import { TelemetrySink } from '@theia/telemetry/lib/node';
import { ConsoleTelemetrySink } from './telemetry-sample/console-telemetry-sink.js';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(SampleBackendPreferencesBackendServiceImpl).toSelf().inSingletonScope();
    bind(ConsoleTelemetrySink).toSelf().inSingletonScope();
    bind(TelemetrySink).toService(ConsoleTelemetrySink);
    bind(MCPBackendContribution).to(MCPTestContribution).inSingletonScope();
    bind(SampleBackendPreferencesService).toService(SampleBackendPreferencesBackendServiceImpl);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(sampleBackendPreferencesServicePath, () => ctx.container.get(SampleBackendPreferencesService))
    ).inSingletonScope();
    bind(PreferenceContribution).toConstantValue({ schema: FileWatchingPreferencesSchema });
    rebindOVSXClientFactory(rebind);
    bind(SampleBackendAppInfo).toSelf().inSingletonScope();
    bind(SampleAppInfo).toService(SampleBackendAppInfo);
    bind(BackendApplicationContribution).toService(SampleBackendAppInfo);
    // bind a mock/sample OpenVSX registry:
    bind(BackendApplicationContribution).to(SampleMockOpenVsxServer).inSingletonScope();
    if (process.env.SAMPLE_BACKEND_APPLICATION_SERVER) {
        bind(BackendApplicationServer).to(SampleBackendApplicationServer).inSingletonScope();
    }
});
