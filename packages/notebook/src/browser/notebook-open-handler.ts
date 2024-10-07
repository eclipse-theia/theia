// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import { URI, MaybePromise, Disposable } from '@theia/core';
import { NavigatableWidgetOpenHandler, PreferenceService, WidgetOpenerOptions, getDefaultHandler, defaultHandlerPriority } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { NotebookFileSelector, NotebookTypeDescriptor } from '../common/notebook-protocol';
import { NotebookEditorWidget } from './notebook-editor-widget';
import { match } from '@theia/core/lib/common/glob';
import { NotebookEditorWidgetOptions } from './notebook-editor-widget-factory';

export interface NotebookWidgetOpenerOptions extends WidgetOpenerOptions {
    notebookType?: string;
}

@injectable()
export class NotebookOpenHandler extends NavigatableWidgetOpenHandler<NotebookEditorWidget> {

    readonly id = NotebookEditorWidget.ID;

    protected notebookTypes: NotebookTypeDescriptor[] = [];

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    registerNotebookType(notebookType: NotebookTypeDescriptor): Disposable {
        this.notebookTypes.push(notebookType);
        return Disposable.create(() => {
            this.notebookTypes.splice(this.notebookTypes.indexOf(notebookType), 1);
        });
    }

    canHandle(uri: URI, options?: NotebookWidgetOpenerOptions): MaybePromise<number> {
        const defaultHandler = getDefaultHandler(uri, this.preferenceService);
        if (options?.notebookType) {
            return this.canHandleType(uri, this.notebookTypes.find(type => type.type === options.notebookType), defaultHandler);
        }
        return Math.max(...this.notebookTypes.map(type => this.canHandleType(uri, type), defaultHandler));
    }

    canHandleType(uri: URI, notebookType?: NotebookTypeDescriptor, defaultHandler?: string): number {
        if (notebookType?.selector && this.matches(notebookType.selector, uri)) {
            return notebookType.type === defaultHandler ? defaultHandlerPriority : this.calculatePriority(notebookType);
        } else {
            return 0;
        }
    }

    protected calculatePriority(notebookType: NotebookTypeDescriptor | undefined): number {
        if (!notebookType) {
            return 0;
        }
        return notebookType.priority === 'option' ? 100 : 200;
    }

    protected findHighestPriorityType(uri: URI): NotebookTypeDescriptor | undefined {
        const matchingTypes = this.notebookTypes
            .filter(notebookType => notebookType.selector && this.matches(notebookType.selector, uri))
            .map(notebookType => ({ descriptor: notebookType, priority: this.calculatePriority(notebookType) }));

        if (matchingTypes.length === 0) {
            return undefined;
        }
        let type = matchingTypes[0];
        for (let i = 1; i < matchingTypes.length; i++) {
            const notebookType = matchingTypes[i];
            if (notebookType.priority > type.priority) {
                type = notebookType;
            }
        }
        return type.descriptor;
    }

    // Override for better options typing
    override open(uri: URI, options?: NotebookWidgetOpenerOptions): Promise<NotebookEditorWidget> {
        return super.open(uri, options);
    }

    protected override createWidgetOptions(uri: URI, options?: NotebookWidgetOpenerOptions): NotebookEditorWidgetOptions {
        const widgetOptions = super.createWidgetOptions(uri, options);
        if (options?.notebookType) {
            return {
                notebookType: options.notebookType,
                ...widgetOptions
            };
        }
        const defaultHandler = getDefaultHandler(uri, this.preferenceService);
        const notebookType = this.notebookTypes.find(type => type.type === defaultHandler)
            || this.findHighestPriorityType(uri);
        if (!notebookType) {
            throw new Error('No notebook types registered for uri: ' + uri.toString());
        }
        return {
            notebookType: notebookType.type,
            ...widgetOptions
        };
    }

    protected matches(selectors: readonly NotebookFileSelector[], resource: URI): boolean {
        return selectors.some(selector => this.selectorMatches(selector, resource));
    }

    protected selectorMatches(selector: NotebookFileSelector, resource: URI): boolean {
        return !!selector.filenamePattern
            && match(selector.filenamePattern, resource.path.name + resource.path.ext);
    }
}
