// *****************************************************************************
// Copyright (C) 2021 SAP SE or an SAP affiliate company and others.
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

import URI from '@theia/core/lib/common/uri';
import {
    ApplicationShell, DiffUris, OpenHandler, OpenerOptions, SplitWidget, Widget, WidgetManager, WidgetOpenerOptions, getDefaultHandler, defaultHandlerPriority
} from '@theia/core/lib/browser';
import { CustomEditor, CustomEditorPriority, CustomEditorSelector } from '../../../common';
import { CustomEditorWidget } from './custom-editor-widget';
import { PluginCustomEditorRegistry } from './plugin-custom-editor-registry';
import { generateUuid } from '@theia/core/lib/common/uuid';
import { DisposableCollection, Emitter, PreferenceService } from '@theia/core';
import { EditorOpenerOptions } from '@theia/editor/lib/browser';
import { PreviewTabWidget } from '@theia/editor-preview/lib/browser/preview-tab-widget';
import { ENABLE_PREVIEW_PREFERENCE } from '@theia/editor-preview/lib/common/editor-preview-preferences';
import { match } from '@theia/core/lib/common/glob';
import { Schemes } from '../../../common/uri-components';

/**
 * Schemes that never match a custom editor's `filenamePattern`, mirroring the
 * excluded schemes in VS Code's `editorResolverService#globMatchesResource`.
 * Theia has no scheme constants for `extension` and `vscode-workspace-trust`,
 * so those are referenced by their literal values.
 */
const nonMatchingSchemes = new Set<string>([
    'extension',
    Schemes.webviewPanel,
    'vscode-workspace-trust',
    Schemes.vscodeSettings
]);

export class CustomEditorOpener implements OpenHandler {

    readonly id: string;
    readonly label: string;

    private readonly onDidOpenCustomEditorEmitter = new Emitter<[CustomEditorWidget, WidgetOpenerOptions?]>();
    readonly onDidOpenCustomEditor = this.onDidOpenCustomEditorEmitter.event;

    constructor(
        private readonly editor: CustomEditor,
        protected readonly shell: ApplicationShell,
        protected readonly widgetManager: WidgetManager,
        protected readonly editorRegistry: PluginCustomEditorRegistry,
        protected readonly preferenceService: PreferenceService
    ) {
        this.id = CustomEditorOpener.toCustomEditorId(this.editor.viewType);
        this.label = this.editor.displayName;
    }

    static toCustomEditorId(editorViewType: string): string {
        return `custom-editor-${editorViewType}`;
    }

    canHandle(uri: URI, options?: OpenerOptions): number {
        let priority = 0;
        const { selector } = this.editor;
        if (DiffUris.isDiffUri(uri)) {
            const [left, right] = DiffUris.decode(uri);
            if (this.matches(selector, right) && this.matches(selector, left)) {
                if (getDefaultHandler(right, this.preferenceService) === this.editor.viewType) {
                    priority = defaultHandlerPriority;
                } else {
                    priority = this.getPriority();
                }
            }
        } else if (this.matches(selector, uri)) {
            if (getDefaultHandler(uri, this.preferenceService) === this.editor.viewType) {
                priority = defaultHandlerPriority;
            } else {
                priority = this.getPriority();
            }
        }
        return priority;
    }

    canOpenWith(uri: URI): number {
        if (this.matches(this.editor.selector, uri)) {
            return this.getPriority();
        }
        return 0;
    }

    getPriority(): number {
        switch (this.editor.priority) {
            case CustomEditorPriority.default: return 500;
            case CustomEditorPriority.builtin: return 400;
            /** `option` should not open the custom-editor by default. */
            case CustomEditorPriority.option: return 1;
            default: return 200;
        }
    }

    protected readonly pendingWidgetPromises = new Map<string, Promise<CustomEditorWidget>>();
    protected async openCustomEditor(uri: URI, options?: EditorOpenerOptions): Promise<CustomEditorWidget> {
        let widget: CustomEditorWidget | undefined;
        let isNewWidget = false;
        const uriString = uri.toString();
        const preview = this.isPreviewEnabled(options);
        let widgetPromise = this.pendingWidgetPromises.get(uriString);
        if (widgetPromise) {
            widget = await widgetPromise;
        } else {
            const widgets = this.widgetManager.getWidgets(CustomEditorWidget.FACTORY_ID) as CustomEditorWidget[];
            widget = widgets.find(w => w.viewType === this.editor.viewType && w.resource.toString() === uriString);
            if (!widget) {
                isNewWidget = true;
                const id = generateUuid();
                widgetPromise = this.widgetManager.getOrCreateWidget<CustomEditorWidget>(CustomEditorWidget.FACTORY_ID, { id }).then(async w => {
                    try {
                        w.viewType = this.editor.viewType;
                        w.resource = uri;
                        w.updateID();
                        if (preview) {
                            w.initializePreview();
                        }
                        await this.editorRegistry.resolveWidget(w);
                        if (options?.widgetOptions) {
                            await this.shell.addWidget(w, options.widgetOptions);
                            if (preview) {
                                // Dispose the superseded preview as soon as the new preview tab attaches.
                                PreviewTabWidget.disposeOtherPreviews(this.shell, w);
                            }
                        }
                        return w;
                    } catch (e) {
                        w.dispose();
                        throw e;
                    }
                }).finally(() => this.pendingWidgetPromises.delete(uriString));
                this.pendingWidgetPromises.set(uriString, widgetPromise);
                widget = await widgetPromise;
            }
        }
        if (!isNewWidget && !preview && widget.isPreview) {
            widget.convertToNonPreview();
        }
        if (options?.mode === 'activate') {
            await this.shell.activateWidget(widget.id);
        } else if (options?.mode === 'reveal') {
            await this.shell.revealWidget(widget.id);
        }
        if (isNewWidget) {
            this.onDidOpenCustomEditorEmitter.fire([widget, options]);
        }
        return widget;
    }

    protected isPreviewEnabled(options?: EditorOpenerOptions): boolean {
        return !!options?.preview && !!this.preferenceService.get<boolean>(ENABLE_PREVIEW_PREFERENCE);
    }

    protected async openSideBySide(uri: URI, options?: WidgetOpenerOptions): Promise<Widget | undefined> {
        const [leftUri, rightUri] = DiffUris.decode(uri);
        const widget = await this.widgetManager.getOrCreateWidget<SplitWidget>(
            CustomEditorWidget.SIDE_BY_SIDE_FACTORY_ID, { uri: uri.toString(), viewType: this.editor.viewType });
        if (!widget.panes.length) { // a new widget
            const trackedDisposables = new DisposableCollection(widget);
            try {
                const createPane = async (paneUri: URI) => {
                    let pane = await this.openCustomEditor(paneUri);
                    if (pane.isAttached) {
                        await this.shell.closeWidget(pane.id);
                        if (!pane.isDisposed) { // user canceled
                            return undefined;
                        }
                        pane = await this.openCustomEditor(paneUri);
                    }
                    return pane;
                };

                const rightPane = await createPane(rightUri);
                if (!rightPane) {
                    trackedDisposables.dispose();
                    return undefined;
                }
                trackedDisposables.push(rightPane);

                const leftPane = await createPane(leftUri);
                if (!leftPane) {
                    trackedDisposables.dispose();
                    return undefined;
                }
                trackedDisposables.push(leftPane);

                widget.addPane(leftPane);
                widget.addPane(rightPane);

                // dispose the widget if either of its panes gets externally disposed
                leftPane.disposed.connect(() => widget.dispose());
                rightPane.disposed.connect(() => widget.dispose());

                if (options?.widgetOptions) {
                    await this.shell.addWidget(widget, options.widgetOptions);
                }
            } catch (e) {
                trackedDisposables.dispose();
                console.error(e);
                throw e;
            }
        }
        if (options?.mode === 'activate') {
            await this.shell.activateWidget(widget.id);
        } else if (options?.mode === 'reveal') {
            await this.shell.revealWidget(widget.id);
        }
        return widget;
    }

    async open(uri: URI, options?: WidgetOpenerOptions): Promise<Widget | undefined> {
        options = { ...options };
        options.mode ??= 'activate';
        options.widgetOptions ??= { area: 'main' };
        return DiffUris.isDiffUri(uri) ? this.openSideBySide(uri, options) : this.openCustomEditor(uri, options);
    }

    matches(selectors: CustomEditorSelector[], resource: URI): boolean {
        return selectors.some(selector => this.selectorMatches(selector, resource));
    }

    selectorMatches(selector: CustomEditorSelector, resource: URI): boolean {
        if (nonMatchingSchemes.has(resource.scheme)) {
            // These schemes match no glob pattern, mirroring VS Code's `globMatchesResource`.
            return false;
        }
        if (selector.filenamePattern) {
            const filenamePattern = selector.filenamePattern.toLowerCase();
            // Mirror VS Code's editor-association matching (editorResolverService#globMatchesResource):
            // a pattern containing a path separator is matched against the full `scheme:path`,
            // a plain pattern is matched against the basename only.
            const target = filenamePattern.includes('/')
                ? `${resource.scheme}:${resource.path.toString()}`.toLowerCase()
                : resource.path.base.toLowerCase();
            if (match(filenamePattern, target)) {
                return true;
            }
        }
        return false;
    }
}
