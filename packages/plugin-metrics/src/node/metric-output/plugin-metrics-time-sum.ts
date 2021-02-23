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
export class PluginMetricTimeSum implements MetricOutput {

    public header = '# HELP language_server_time_sum Sum of time in milliseconds that language server requests take\n# TYPE language_server_time_sum gauge\n';

    createMetricOutput(id: string, method: string, requestAnalytics: AnalyticsFromRequests): string {
        const successTime = requestAnalytics.sumOfTimeForSuccess;
        const success = `language_server_time_sum{id="${id}" method="${method}" result="success"} ${successTime}\n`;

        const failureTime = requestAnalytics.sumOfTimeForFailure;
        const failure = `language_server_time_sum{id="${id}" method="${method}" result="failure"} ${failureTime}\n`;

        return success + failure;
    }

}
