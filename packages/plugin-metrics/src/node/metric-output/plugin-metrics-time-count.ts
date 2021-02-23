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

import { MetricOutput, AnalyticsFromRequests } from '../../common/plugin-metrics-types';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class PluginMetricTimeCount implements MetricOutput {

    public header = '# HELP language_server_time_count Number of language server requests\n# TYPE language_server_time_count gauge\n';

    createMetricOutput(id: string, method: string, requestAnalytics: AnalyticsFromRequests): string {
        if (requestAnalytics.successfulResponses < 0) {
            requestAnalytics.successfulResponses = 0;
        }
        const successMetric = `language_server_time_count{id="${id}" method="${method}" result="success"} ${requestAnalytics.successfulResponses}\n`;

        const failedRequests = requestAnalytics.totalRequests - requestAnalytics.successfulResponses;
        const failureMetric = `language_server_time_count{id="${id}" method="${method}" result="fail"} ${failedRequests}\n`;
        return successMetric + failureMetric;
    }

}
