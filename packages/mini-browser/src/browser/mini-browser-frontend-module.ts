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

import '../../src/browser/style/index.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { OpenHandler } from '@theia/core/lib/browser/opener-service';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { bindContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging/ws-connection-provider';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { CommandContribution } from '@theia/core/lib/common/command';
import { MenuContribution } from '@theia/core/lib/common/menu';
import { NavigatableWidgetOptions } from '@theia/core/lib/browser/navigatable';
import { MiniBrowserOpenHandler } from './mini-browser-open-handler';
import { MiniBrowserService, MiniBrowserServicePath } from '../common/mini-browser-service';
import { MiniBrowser, MiniBrowserOptions } from './mini-browser';
import { MiniBrowserProps, MiniBrowserContentFactory, MiniBrowserContent } from './mini-browser-content';
import {
    LocationMapperService,
    FileLocationMapper,
    HttpLocationMapper,
    HttpsLocationMapper,
    LocationMapper,
    LocationWithoutSchemeMapper,
} from './location-mapper-service';

export default new ContainerModule(bind => {

    bind(MiniBrowserContent).toSelf();
    bind(MiniBrowserContentFactory).toFactory(context => (props: MiniBrowserProps) => {
        const { container } = context;
        const child = container.createChild();
        child.bind(MiniBrowserProps).toConstantValue(props);
        return child.get(MiniBrowserContent);
    });

    bind(MiniBrowser).toSelf();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: MiniBrowser.ID,
        async createWidget(options: NavigatableWidgetOptions): Promise<MiniBrowser> {
            const { container } = context;
            const child = container.createChild();
            const uri = new URI(options.uri);
            child.bind(MiniBrowserOptions).toConstantValue({ uri });
            return child.get(MiniBrowser);
        }
    })).inSingletonScope();

    bind(MiniBrowserOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(MiniBrowserOpenHandler);
    bind(FrontendApplicationContribution).toService(MiniBrowserOpenHandler);
    bind(CommandContribution).toService(MiniBrowserOpenHandler);
    bind(MenuContribution).toService(MiniBrowserOpenHandler);
    bind(TabBarToolbarContribution).toService(MiniBrowserOpenHandler);

    bindContributionProvider(bind, LocationMapper);
    bind(LocationMapper).to(FileLocationMapper).inSingletonScope();
    bind(LocationMapper).to(HttpLocationMapper).inSingletonScope();
    bind(LocationMapper).to(HttpsLocationMapper).inSingletonScope();
    bind(LocationWithoutSchemeMapper).toSelf().inSingletonScope();
    bind(LocationMapper).toService(LocationWithoutSchemeMapper);
    bind(LocationMapperService).toSelf().inSingletonScope();

    bind(MiniBrowserService).toDynamicValue(context => WebSocketConnectionProvider.createProxy(context.container, MiniBrowserServicePath)).inSingletonScope();
});
