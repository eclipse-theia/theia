/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Resource } from '@theia/core';
import { BaseWidget, Message } from '@theia/core/lib/browser';

export const MARKDOWN_WIDGET_CLASS = 'theia-markdown-widget';

export class MarkdownPreviewWidget extends BaseWidget {

    constructor(
        protected readonly resource: Resource
    ) {
        super();
        this.addClass(MARKDOWN_WIDGET_CLASS);
        this.node.tabIndex = 0;
        this.toDispose.push(resource);
        if (resource.onDidChangeContents) {
            this.toDispose.push(resource.onDidChangeContents(() => this.update()));
        }
        this.update();
    }

    onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
        this.update();
    }

    onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        this.resource.readContents().then(html =>
            this.node.innerHTML = html
        );
    }

}
