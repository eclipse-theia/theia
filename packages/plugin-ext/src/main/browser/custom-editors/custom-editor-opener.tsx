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

import { inject } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { ApplicationShell, OpenHandler, Widget, WidgetManager, WidgetOpenerOptions } from '@theia/core/lib/browser';
import { CustomEditor, CustomEditorPriority, CustomEditorSelector } from '../../../common';
import { CustomEditorWidget } from './custom-editor-widget';
import { v4 } from 'uuid';
import { Emitter } from '@theia/core';
import { match } from '@theia/core/lib/common/glob';

export class CustomEditorOpener implements OpenHandler {

    readonly id: string;
    readonly label: string;

    private readonly onDidOpenCustomEditorEmitter = new Emitter<[CustomEditorWidget, WidgetOpenerOptions?]>();
    readonly onDidOpenCustomEditor = this.onDidOpenCustomEditorEmitter.event;

    constructor(
        private readonly editor: CustomEditor,
        @inject(ApplicationShell) protected readonly shell: ApplicationShell,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager
    ) {
        this.id = CustomEditorOpener.toCustomEditorId(this.editor.viewType);
        this.label = this.editor.displayName;
    }

    static toCustomEditorId(editorViewType: string): string {
        return `custom-editor-${editorViewType}`;
    }

    canHandle(uri: URI): number {
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
    async open(uri: URI, options?: WidgetOpenerOptions): Promise<Widget | undefined> {
        let widget: CustomEditorWidget | undefined;
        const widgets = this.widgetManager.getWidgets(CustomEditorWidget.FACTORY_ID) as CustomEditorWidget[];
        widget = widgets.find(w => w.viewType === this.editor.viewType && w.resource.toString() === uri.toString());

        if (widget?.isVisible) {
            return this.shell.revealWidget(widget.id);
        }
        if (widget?.isAttached) {
            return this.shell.activateWidget(widget.id);
        }
        if (!widget) {
            const uriString = uri.toString();
            let widgetPromise = this.pendingWidgetPromises.get(uriString);
            if (!widgetPromise) {
                const id = v4();
                widgetPromise = this.widgetManager.getOrCreateWidget<CustomEditorWidget>(CustomEditorWidget.FACTORY_ID, { id });
                this.pendingWidgetPromises.set(uriString, widgetPromise);
                widget = await widgetPromise;
                this.pendingWidgetPromises.delete(uriString);
                widget.viewType = this.editor.viewType;
                widget.resource = uri;
                this.onDidOpenCustomEditorEmitter.fire([widget, options]);
            }
        }
        return widget;
    }

    matches(selectors: CustomEditorSelector[], resource: URI): boolean {
        return selectors.some(selector => this.selectorMatches(selector, resource));
    }

    selectorMatches(selector: CustomEditorSelector, resource: URI): boolean {
        if (selector.filenamePattern) {
            if (match(selector.filenamePattern.toLowerCase(), resource.path.name.toLowerCase() + resource.path.ext.toLowerCase())) {
                return true;
            }
        }
        return false;
    }
}
