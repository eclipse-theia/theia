/*
 * Copyright (C) 2017-2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { bindContributionProvider } from '@theia/core/lib/common';
import { MetricsContribution, NodeMetricsContribution, MetricsBackendApplicationContribution, ExtensionMetricsContribution } from './';

export default new ContainerModule(bind => {

    bindContributionProvider(bind, MetricsContribution);
    bind(MetricsContribution).to(NodeMetricsContribution);
    bind(MetricsContribution).to(ExtensionMetricsContribution);

    bind(BackendApplicationContribution).to(MetricsBackendApplicationContribution);

});
