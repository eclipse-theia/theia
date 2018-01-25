/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { CommandContribution, MenuContribution, bindContributionProvider } from '@theia/core/lib/common';
import { OpenHandler, WidgetFactory, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { PreviewContribution } from './preview-contribution';
import { PreviewWidget } from './preview-widget';
import { PreviewWidgetManager } from './preview-widget-manager';
import { PreviewHandler, PreviewHandlerProvider } from './preview-handler';
import { MarkdownPreviewHandler } from './markdown';

import '../../src/browser/style/index.css';
import '../../src/browser/markdown/style/index.css';

export default new ContainerModule(bind => {
    bind(PreviewHandlerProvider).toSelf().inSingletonScope();
    bindContributionProvider(bind, PreviewHandler);
    bind(MarkdownPreviewHandler).toSelf().inSingletonScope();
    bind(PreviewHandler).toDynamicValue(ctx => ctx.container.get(MarkdownPreviewHandler));

    bind(PreviewWidget).toSelf();
    bind(PreviewWidgetManager).toDynamicValue(ctx => new PreviewWidgetManager(ctx.container)).inSingletonScope();
    bind(WidgetFactory).toDynamicValue(ctx => ctx.container.get(PreviewWidgetManager));

    bind(PreviewContribution).toSelf().inSingletonScope();
    [CommandContribution, MenuContribution, OpenHandler, FrontendApplicationContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toDynamicValue(c => c.container.get(PreviewContribution)).inSingletonScope()
    );
});
