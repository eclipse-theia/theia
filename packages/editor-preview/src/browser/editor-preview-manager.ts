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

import { injectable, inject, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { ApplicationShell, DockPanel } from '@theia/core/lib/browser';
import { EditorManager,  EditorOpenerOptions, EditorWidget } from '@theia/editor/lib/browser';
import { EditorPreviewWidget } from './editor-preview-widget';
import { EditorPreviewWidgetFactory, EditorPreviewWidgetOptions } from './editor-preview-factory';
import { EditorPreviewPreferences } from './editor-preview-preferences';
import { WidgetOpenHandler, WidgetOpenerOptions } from '@theia/core/lib/browser';
import { MaybePromise } from '@theia/core/src/common';

/**
 * Opener options containing an optional preview flag.
 */
export interface PreviewEditorOpenerOptions extends EditorOpenerOptions {
    preview?: boolean
}

/**
 * Class for managing an editor preview widget.
 */
@injectable()
export class EditorPreviewManager extends WidgetOpenHandler<EditorPreviewWidget|EditorWidget> {

    readonly id = EditorPreviewWidgetFactory.ID;

    readonly label = 'Code Editor Preview';

    protected currentEditorPreview: EditorPreviewWidget | undefined;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(EditorPreviewPreferences)
    protected readonly preferences: EditorPreviewPreferences;

    @postConstruct()
    protected init(): void {
        super.init();
        this.onCreated(widget => {
            if (widget instanceof EditorPreviewWidget) {
                this.handlePreviewWidgetCreated(widget);
            }
        });
    }

    protected handlePreviewWidgetCreated(widget: EditorPreviewWidget): void {
        // Enforces only one preview widget exists at a given time.
        if (this.currentEditorPreview) {
            this.currentEditorPreview.pinEditorWidget();
        }

        this.currentEditorPreview = widget;
        widget.disposed.connect(() => this.currentEditorPreview = undefined);

        widget.onPinned(({preview, editorWidget}) => {
            // TODO(caseyflynn): I don't believe there is ever a case where
            // this will not hold true.
            if (preview.parent && preview.parent instanceof DockPanel) {
                preview.parent.addWidget(editorWidget, {ref: preview});
            } else {
                this.shell.addWidget(editorWidget, {area: 'main'});
            }
            preview.close();
            this.shell.activateWidget(editorWidget.id);
            this.currentEditorPreview = undefined;
        });
    }

    protected isCurrentPreviewUri(uri: URI): boolean {
        const currentUri = this.currentEditorPreview && this.currentEditorPreview.getResourceUri();
        return !!currentUri && currentUri.isEqualOrParent(uri);
    }

    canHandle(uri: URI, options?: PreviewEditorOpenerOptions): MaybePromise<number> {
        if (this.preferences['editor.enablePreview'] && (options && options.preview || this.isCurrentPreviewUri(uri))) {
            return 200;
        }
        return 0;
    }

    async open(uri: URI, options?: PreviewEditorOpenerOptions): Promise<EditorPreviewWidget | EditorWidget> {
        options = {...options, mode: 'open'};

        if (await this.editorManager.getByUri(uri)) {
            let widget: EditorWidget | EditorPreviewWidget = await this.editorManager.open(uri, options);
            if (widget.parent instanceof EditorPreviewWidget) {
                if (!options.preview) {
                    widget.parent.pinEditorWidget();
                }
                widget = widget.parent;
            }
            this.shell.revealWidget(widget.id);
            return widget;
        }

        if (!this.currentEditorPreview) {
            this.currentEditorPreview = await super.open(uri, options) as EditorPreviewWidget;
        } else {
            const childWidget = await this.editorManager.getOrCreateByUri(uri);
            this.currentEditorPreview.replaceEditorWidget(childWidget);
        }

        this.editorManager.open(uri, options);
        this.shell.revealWidget(this.currentEditorPreview!.id);
        return this.currentEditorPreview;
    }

    protected createWidgetOptions(uri: URI, options?: WidgetOpenerOptions): EditorPreviewWidgetOptions {
        return {
            kind: 'editor-preview-widget',
            id: EditorPreviewWidgetFactory.generateUniqueId(),
            initialUri: uri.withoutFragment().toString(),
            session: EditorPreviewWidgetFactory.sessionId
        };
    }
}
