/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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
import { MetricsContribution } from './metrics-contribution';
import { ApplicationPackage } from '@theia/core/shared/@theia/application-package';
import { PROMETHEUS_REGEXP, toPrometheusValidName } from './prometheus';

const metricsName = 'theia_extension_version';

@injectable()
export class ExtensionMetricsContribution implements MetricsContribution {
    private metrics: string = '';

    @inject(ApplicationPackage)
    protected readonly applicationPackage: ApplicationPackage;

    getMetrics(): string {
        return this.metrics;
    }

    startCollecting(): void {
        let latestMetrics = '';
        const installedExtensions = this.applicationPackage.extensionPackages;
        latestMetrics += `# HELP ${metricsName} Theia extension version info.\n`;
        latestMetrics += `# TYPE ${metricsName} gauge\n`;
        installedExtensions.forEach(extensionInfo => {
            let extensionName = extensionInfo.name;
            if (!PROMETHEUS_REGEXP.test(extensionName)) {
                extensionName = toPrometheusValidName(extensionName);
            }

            const metricsValue = metricsName + `{extension="${extensionName}",version="${extensionInfo.version}"} 1`;
            latestMetrics += metricsValue + '\n';
        });

        this.metrics = latestMetrics;
    }
}
