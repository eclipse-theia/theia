/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { CommandContribution, MenuContribution, bindContributionProvider, ResourceProvider } from '@theia/core/lib/common';
import { OpenHandler, WidgetFactory, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { PreviewContribution } from './preview-contribution';
import { PreviewWidget, PreviewWidgetOptions } from './preview-widget';
import { PreviewHandler, PreviewHandlerProvider } from './preview-handler';
import { PreviewUri } from './preview-uri';
import { MarkdownPreviewHandler } from './markdown';
import { bindPreviewPreferences } from './preview-preferences';

import '../../src/browser/style/index.css';
import '../../src/browser/markdown/style/index.css';

export default new ContainerModule(bind => {
    bindPreviewPreferences(bind);
    bind(PreviewHandlerProvider).toSelf().inSingletonScope();
    bindContributionProvider(bind, PreviewHandler);
    bind(MarkdownPreviewHandler).toSelf().inSingletonScope();
    bind(PreviewHandler).toService(MarkdownPreviewHandler);

    bind(PreviewWidget).toSelf();
    bind<WidgetFactory>(WidgetFactory).toDynamicValue(ctx => ({
        id: PreviewUri.id,
        async createWidget(uri: string): Promise<PreviewWidget> {
            const { container } = ctx;
            const resource = await container.get<ResourceProvider>(ResourceProvider)(new URI(uri));
            const child = container.createChild();
            child.bind<PreviewWidgetOptions>(PreviewWidgetOptions).toConstantValue({ resource });
            return child.get(PreviewWidget);
        }
    })).inSingletonScope();

    bind(PreviewContribution).toSelf().inSingletonScope();
    [CommandContribution, MenuContribution, OpenHandler, FrontendApplicationContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toService(PreviewContribution)
    );
});
