/********************************************************************************
 * Copyright (C) 2018 Google and others.
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

import URI from '@theia/core/lib/common/uri';
import { WidgetFactory, WidgetManager } from '@theia/core/lib/browser';
import { MaybePromise } from '@theia/core/lib/common/types';
import { EditorPreviewWidget } from './editor-preview-widget';
import { inject, injectable } from '@theia/core/shared/inversify';
import { EditorManager } from '@theia/editor/lib/browser';
import { UUID } from '@theia/core/shared/@phosphor/coreutils';

export interface EditorPreviewWidgetOptions {
    kind: 'editor-preview-widget',
    id: string,
    initialUri: string,
    session: string,
}

@injectable()
export class EditorPreviewWidgetFactory implements WidgetFactory {

    static ID: string = 'editor-preview-widget';

    static generateUniqueId(): string {
        return UUID.uuid4();
    }

    readonly id = EditorPreviewWidgetFactory.ID;
    static readonly sessionId = EditorPreviewWidgetFactory.generateUniqueId();

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    createWidget(options: EditorPreviewWidgetOptions): MaybePromise<EditorPreviewWidget> {
        return this.doCreate(options);
    }

    protected async doCreate(options: EditorPreviewWidgetOptions): Promise<EditorPreviewWidget> {
        const widget = (options.session === EditorPreviewWidgetFactory.sessionId)
            ? await this.editorManager.getOrCreateByUri(new URI(options.initialUri))
            : undefined;
        const previewWidget = new EditorPreviewWidget(this.widgetManager, widget);
        previewWidget.id = options.id;
        return previewWidget;
    }
}
