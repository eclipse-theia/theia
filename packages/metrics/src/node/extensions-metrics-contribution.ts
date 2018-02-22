/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import * as yargs from 'yargs';
import { injectable } from 'inversify';
import { MetricsContribution } from './';
import { ApplicationPackageManager } from '@theia/application-package';

const appProjectPath = 'app-project-path';

@injectable()
export class ExtensionMetricsContribution implements MetricsContribution {
    private metrics: string = "";
    readonly applicationPackageManager: ApplicationPackageManager;

    getMetrics(): string {
        return this.metrics;
    }

    startCollecting(): void {
        const projectPath = yargs.parse(process.argv)[appProjectPath];
        let latestMetrics = "";
        const app = new ApplicationPackageManager({ projectPath });
        const installedExtensions = app.pck.extensionPackages;
        installedExtensions.forEach(extensionInfo => {
            /* TODO Make sure that theia extensions really always follow @theia/something pattern ? and only one /*/
            const extensionName = extensionInfo.name.split('/')[1];
            const metricsName = 'theia_extension_' + extensionName;
            const metricsValue = metricsName + `{version="${extensionInfo.version}"} 1`;
            latestMetrics += metricsValue + '\n';
        });

        this.metrics = latestMetrics;
    }
}
