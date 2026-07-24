// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser';
import { ContainerModule } from '@theia/core/shared/inversify';
import { bindAnalyticsPreferences } from '../common/analytics-preferences';
import { analyticsServicePath, AnalyticsRpc } from '../common/analytics-protocol';
import { AnalyticsService } from '../common/analytics-service';
import { BrowserAnalyticsService } from './analytics-service';

export default new ContainerModule(bind => {
    bindAnalyticsPreferences(bind);
    bind(AnalyticsRpc).toDynamicValue(ctx => {
        const connectionProvider = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        return connectionProvider.createProxy<AnalyticsRpc>(analyticsServicePath);
    }).inSingletonScope();
    bind(BrowserAnalyticsService).toSelf().inSingletonScope();
    bind(AnalyticsService).toService(BrowserAnalyticsService);
});
