/********************************************************************************
 * Copyright (C) 2017-2018 Ericsson and others.
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
import { BackendApplicationContribution, CliContribution } from '@theia/core/lib/node';
import { bindContributionProvider } from '@theia/core/lib/common';
import {
    MetricsContribution,
    NodeMetricsContribution,
    MetricsProjectPath,
    MetricsBackendApplicationContribution,
    ExtensionMetricsContribution,
    MetricsCliContribution
} from './';

export default new ContainerModule(bind => {

    bind(MetricsCliContribution).toSelf().inSingletonScope();
    bind(CliContribution).toService(MetricsCliContribution);

    bind(MetricsProjectPath).toDynamicValue(ctx => {
        const contrib = ctx.container.get(MetricsCliContribution);
        if (contrib.applicationPath) {
            return contrib.applicationPath;
        } else {
            return process.cwd();
        }
    }).inSingletonScope();

    bindContributionProvider(bind, MetricsContribution);
    bind(MetricsContribution).to(NodeMetricsContribution);
    bind(MetricsContribution).to(ExtensionMetricsContribution);

    bind(BackendApplicationContribution).to(MetricsBackendApplicationContribution);

});
