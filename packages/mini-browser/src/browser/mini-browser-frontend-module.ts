/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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
import { OpenHandler } from '@theia/core/lib/browser/opener-service';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { bindContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging/ws-connection-provider';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application';
import { MiniBrowserOpenHandler } from './mini-browser-open-handler';
import { MiniBrowserService, MiniBrowserServicePath } from '../common/mini-browser-service';
import { MiniBrowser, MiniBrowserProps, MiniBrowserMouseClickTracker } from './mini-browser';
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
    bind(FrontendApplicationContribution).toService(MiniBrowserOpenHandler);

    bindContributionProvider(bind, LocationMapper);
    bind(LocationMapper).to(FileLocationMapper).inSingletonScope();
    bind(LocationMapper).to(HttpLocationMapper).inSingletonScope();
    bind(LocationMapper).to(HttpsLocationMapper).inSingletonScope();
    bind(LocationMapperService).toSelf().inSingletonScope();

    bind(MiniBrowserService).toDynamicValue(context => WebSocketConnectionProvider.createProxy(context.container, MiniBrowserServicePath)).inSingletonScope();
});
