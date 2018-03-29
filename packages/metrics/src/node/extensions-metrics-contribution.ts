/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable, inject } from 'inversify';
import { MetricsContribution, MetricsProjectPath } from './metrics-contribution';
import { ApplicationPackageManager } from '@theia/application-manager';
import { PROMETHEUS_REGEXP, toPrometheusValidName } from './prometheus';

const metricsName = 'theia_extension_version';

@injectable()
export class ExtensionMetricsContribution implements MetricsContribution {
    private metrics: string = "";
    readonly applicationPackageManager: ApplicationPackageManager;

    constructor(@inject(MetricsProjectPath) readonly appProjectPath: string) { }

    getMetrics(): string {
        return this.metrics;
    }

    startCollecting(): void {
        const projectPath = this.appProjectPath;
        let latestMetrics = "";
        const app = new ApplicationPackageManager({ projectPath });
        const installedExtensions = app.pck.extensionPackages;
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
