/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { ResourceResolver } from '@theia/core/lib/common';
import { OpenHandler } from '@theia/core/lib/browser';
import { MarkdownUri } from './markdown-uri';
import { MarkdownPreviewOpenHandler } from './markdown-preview-open-handler';
import { MarkdownResourceResolver } from './markdown-resource';

import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bind(MarkdownUri).toSelf().inSingletonScope();

    bind(MarkdownPreviewOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toDynamicValue(ctx => ctx.container.get(MarkdownPreviewOpenHandler)).inSingletonScope();

    bind(MarkdownResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toDynamicValue(ctx => ctx.container.get(MarkdownResourceResolver)).inSingletonScope();
});
