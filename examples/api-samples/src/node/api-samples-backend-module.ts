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
import { SampleBackendApplicationServer } from './sample-backend-application-server';
import { SampleMockOpenVsxServer } from './sample-mock-open-vsx-server';
import { SampleAppInfo } from '../common/vsx/sample-app-info';
import { SampleBackendAppInfo } from './sample-backend-app-info';
import { rebindOVSXClientFactory } from '../common/vsx/sample-ovsx-client-factory';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
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
