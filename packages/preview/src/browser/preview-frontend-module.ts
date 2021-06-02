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

import { ContainerModule } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { CommandContribution, MenuContribution, bindContributionProvider, ResourceProvider } from '@theia/core/lib/common';
import { OpenHandler, WidgetFactory, FrontendApplicationContribution, NavigatableWidgetOptions } from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { PreviewContribution } from './preview-contribution';
import { PreviewWidget, PreviewWidgetOptions } from './preview-widget';
import { PreviewHandler, PreviewHandlerProvider } from './preview-handler';
import { PreviewUri } from './preview-uri';
import { MarkdownPreviewHandler } from './markdown';
import { bindPreviewPreferences } from './preview-preferences';
import { PreviewLinkNormalizer } from './preview-link-normalizer';

import '../../src/browser/style/index.css';
import '../../src/browser/markdown/style/index.css';

export default new ContainerModule(bind => {
    bindPreviewPreferences(bind);
    bind(PreviewHandlerProvider).toSelf().inSingletonScope();
    bindContributionProvider(bind, PreviewHandler);
    bind(MarkdownPreviewHandler).toSelf().inSingletonScope();
    bind(PreviewHandler).toService(MarkdownPreviewHandler);
    bind(PreviewLinkNormalizer).toSelf().inSingletonScope();

    bind(PreviewWidget).toSelf();
    bind<WidgetFactory>(WidgetFactory).toDynamicValue(ctx => ({
        id: PreviewUri.id,
        async createWidget(options: NavigatableWidgetOptions): Promise<PreviewWidget> {
            const { container } = ctx;
            const resource = await container.get<ResourceProvider>(ResourceProvider)(new URI(options.uri));
            const child = container.createChild();
            child.bind<PreviewWidgetOptions>(PreviewWidgetOptions).toConstantValue({ resource });
            return child.get(PreviewWidget);
        }
    })).inSingletonScope();

    bind(PreviewContribution).toSelf().inSingletonScope();
    [CommandContribution, MenuContribution, OpenHandler, FrontendApplicationContribution, TabBarToolbarContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toService(PreviewContribution)
    );
});
