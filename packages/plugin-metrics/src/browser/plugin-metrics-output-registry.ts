/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { OutputChannelRegistryMainImpl } from '@theia/plugin-ext/lib/main/browser/output-channel-registry-main';
import { PluginMetricsCreator } from './plugin-metrics-creator';
import { createDefaultRequestData } from '../common/plugin-metrics-types';
import { PluginInfo } from '@theia/plugin-ext/lib/common/plugin-api-rpc';

@injectable()
export class PluginMetricsOutputChannelRegistry extends OutputChannelRegistryMainImpl {

    @inject(PluginMetricsCreator)
    protected readonly pluginMetricsCreator: PluginMetricsCreator;

    $append(channelName: string, errorOrValue: string, pluginInfo: PluginInfo): PromiseLike<void> {
        if (errorOrValue.startsWith('[Error')) {
            const createdMetric = createDefaultRequestData(pluginInfo.id, errorOrValue);
            this.pluginMetricsCreator.createErrorMetric(createdMetric);
        }
        return super.$append(channelName, errorOrValue, pluginInfo);
    }

}
