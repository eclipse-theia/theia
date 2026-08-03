// *****************************************************************************
// Copyright (C) 2017-2018 Ericsson and others.
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

import { bindRootContributionProvider } from '@theia/core/lib/common';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { ContainerModule } from '@theia/core/shared/inversify';
import { TelemetrySink } from '@theia/telemetry/lib/node';
import { ExtensionMetricsContribution } from './extensions-metrics-contribution';
import { MeasurementMetricsBackendContribution } from './measurement-metrics-contribution';
import { MeasurementTelemetryContribution } from './measurement-telemetry-contribution';
import { MetricsBackendApplicationContribution } from './metrics-backend-application-contribution';
import { MetricsContribution } from './metrics-contribution';
import { NodeMetricsContribution } from './node-metrics-contribution';

export default new ContainerModule(bind => {
    bindRootContributionProvider(bind, MetricsContribution);
    bind(MetricsContribution).to(NodeMetricsContribution).inSingletonScope();
    bind(MetricsContribution).to(ExtensionMetricsContribution).inSingletonScope();

    bind(MeasurementMetricsBackendContribution).toSelf().inSingletonScope();
    bind(MetricsContribution).toService(MeasurementMetricsBackendContribution);
    bind(TelemetrySink).toService(MeasurementMetricsBackendContribution);

    bind(BackendApplicationContribution).to(MetricsBackendApplicationContribution).inSingletonScope();
    bind(BackendApplicationContribution).to(MeasurementTelemetryContribution).inSingletonScope();

});
