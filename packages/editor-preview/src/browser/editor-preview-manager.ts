// *****************************************************************************
// Copyright (C) 2018-2021 Google and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { EditorManager, EditorOpenerOptions, EditorWidget } from '@theia/editor/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { EditorPreviewPreferences } from './editor-preview-preferences';
import { MaybePromise } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { EditorPreviewWidgetFactory, EditorPreviewOptions } from './editor-preview-widget-factory';
import { EditorPreviewWidget } from './editor-preview-widget';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { WidgetOpenerOptions } from '@theia/core/lib/browser';

@injectable()
export class EditorPreviewManager extends EditorManager {
    override readonly id = EditorPreviewWidgetFactory.ID;

    @inject(EditorPreviewPreferences) protected readonly preferences: EditorPreviewPreferences;
    @inject(FrontendApplicationStateService) protected readonly stateService: FrontendApplicationStateService;

    /**
     * Until the layout has been restored, widget state is not reliable, so we ignore creation events.
     */
    protected layoutIsSet = false;

    @postConstruct()
    protected override init(): void {
        super.init();
        // All editors are created, but not all are opened. This sets up the logic to swap previews when the editor is attached.
        this.onCreated((widget: EditorPreviewWidget) => {
            if (this.layoutIsSet && widget.isPreview) {
                const oneTimeDisposable = widget.onDidChangeVisibility(() => {
                    this.handleNewPreview(widget);
                    oneTimeDisposable.dispose();
                });
            }
        });

        this.preferences.onPreferenceChanged(change => {
            if (change.preferenceName === 'editor.enablePreview' && !change.newValue) {
                this.all.forEach((editor: EditorPreviewWidget) => {
                    if (editor.isPreview) {
                        editor.convertToNonPreview();
                    }
                });
            };
        });

        this.stateService.reachedState('initialized_layout').then(() => {
            const editors = this.all as EditorPreviewWidget[];
            const currentPreview = editors.find(editor => editor.isPreview);
            if (currentPreview) {
                this.handleNewPreview(currentPreview);
            }
            this.layoutIsSet = true;
        });

        document.addEventListener('dblclick', this.convertEditorOnDoubleClick.bind(this));
    }

    protected override async doOpen(widget: EditorPreviewWidget, uri: URI, options?: EditorOpenerOptions): Promise<void> {
        const { preview, widgetOptions = { area: 'main' }, mode = 'activate' } = options ?? {};
        if (!widget.isAttached) {
            await this.shell.addWidget(widget, widgetOptions);
        } else if (!preview && widget.isPreview) {
            widget.convertToNonPreview();
        }

        if (mode === 'activate') {
            await this.shell.activateWidget(widget.id);
        } else if (mode === 'reveal') {
            await this.shell.revealWidget(widget.id);
        }
        await this.revealSelection(widget, uri, options);
    }

    protected handleNewPreview(newPreviewWidget: EditorPreviewWidget): void {
        if (newPreviewWidget.isPreview) {
            const tabbar = this.shell.getTabBarFor(newPreviewWidget);
            if (tabbar) {
                for (const title of tabbar.titles) {
                    if (title.owner !== newPreviewWidget && title.owner instanceof EditorPreviewWidget && title.owner.isPreview) {
                        title.owner.dispose();
                    }
                }
            }
        }
    }

    protected override tryGetPendingWidget(uri: URI, options?: EditorOpenerOptions): MaybePromise<EditorWidget> | undefined {
        return super.tryGetPendingWidget(uri, { ...options, preview: true } as WidgetOpenerOptions) ??
            super.tryGetPendingWidget(uri, { ...options, preview: false } as WidgetOpenerOptions);
    }

    protected override async getWidget(uri: URI, options?: EditorOpenerOptions): Promise<EditorWidget | undefined> {
        return (await super.getWidget(uri, { ...options, preview: true } as WidgetOpenerOptions)) ?? super.getWidget(uri, { ...options, preview: false } as WidgetOpenerOptions);
    }

    protected override async getOrCreateWidget(uri: URI, options?: EditorOpenerOptions): Promise<EditorWidget> {
        return this.tryGetPendingWidget(uri, options) ?? super.getOrCreateWidget(uri, options);
    }

    protected override createWidgetOptions(uri: URI, options?: EditorOpenerOptions): EditorPreviewOptions {
        const navigatableOptions = super.createWidgetOptions(uri, options) as EditorPreviewOptions;
        navigatableOptions.preview = !!(options?.preview && this.preferences['editor.enablePreview']);
        return navigatableOptions;
    }

    protected convertEditorOnDoubleClick(event: Event): void {
        const widget = this.shell.findTargetedWidget(event);
        if (widget instanceof EditorPreviewWidget && widget.isPreview) {
            widget.convertToNonPreview();
        }
    }
}
