/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { OpenHandler } from '@theia/core/lib/browser/opener-service';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { bindContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application';
import { MiniBrowser, MiniBrowserProps, MiniBrowserMouseClickTracker } from './mini-browser';
import { MiniBrowserOpenHandler } from './mini-browser-open-handler';
import { LocationMapperService, FileLocationMapper, HttpLocationMapper, HttpsLocationMapper, LocationMapper } from './location-mapper-service';

import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bind(MiniBrowserMouseClickTracker).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MiniBrowserMouseClickTracker);

    bind(MiniBrowser).toSelf();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: MiniBrowser.Factory.ID,
        async createWidget(props: MiniBrowserProps): Promise<MiniBrowser> {
            const { container } = context;
            const child = container.createChild();
            child.bind(MiniBrowserProps).toConstantValue(props);
            return child.get(MiniBrowser);
        }
    })).inSingletonScope();

    bind(MiniBrowserOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(MiniBrowserOpenHandler);

    bindContributionProvider(bind, LocationMapper);
    bind(LocationMapper).to(FileLocationMapper).inSingletonScope();
    bind(LocationMapper).to(HttpLocationMapper).inSingletonScope();
    bind(LocationMapper).to(HttpsLocationMapper).inSingletonScope();
    bind(LocationMapperService).toSelf().inSingletonScope();
});
