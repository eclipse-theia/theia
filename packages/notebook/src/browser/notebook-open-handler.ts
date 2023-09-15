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

import { URI, MaybePromise } from '@theia/core';
import { NavigatableWidgetOpenHandler, WidgetOpenerOptions } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { NotebookFileSelector, NotebookTypeDescriptor } from '../common/notebook-protocol';
import { NotebookTypeRegistry } from './notebook-type-registry';
import { NotebookEditorWidget } from './notebook-editor-widget';
import { match } from '@theia/core/lib/common/glob';
import { NotebookEditorWidgetOptions } from './notebook-editor-widget-factory';

@injectable()
export class NotebookOpenHandler extends NavigatableWidgetOpenHandler<NotebookEditorWidget> {

    id: string = 'notebook';

    @inject(NotebookTypeRegistry)
    protected notebookTypeRegistry: NotebookTypeRegistry;

    canHandle(uri: URI, options?: WidgetOpenerOptions | undefined): MaybePromise<number> {
        const priorities = this.notebookTypeRegistry.notebookTypes
            .filter(notebook => notebook.selector && this.matches(notebook.selector, uri))
            .map(notebook => this.calculatePriority(notebook));
        return Math.max(...priorities);
    }

    protected findHighestPriorityType(uri: URI): NotebookTypeDescriptor | undefined {
        const matchingTypes = this.notebookTypeRegistry.notebookTypes
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

    protected calculatePriority(notebookType: NotebookTypeDescriptor | undefined): number {
        if (!notebookType) {
            return 0;
        }
        return notebookType.priority === 'option' ? 100 : 200;
    }

    protected override createWidgetOptions(uri: URI, options?: WidgetOpenerOptions | undefined): NotebookEditorWidgetOptions {
        const widgetOptions = super.createWidgetOptions(uri, options);
        const notebookType = this.findHighestPriorityType(uri);
        if (!notebookType) {
            throw new Error('No notebook types registered for uri: ' + uri.toString());
        }
        return {
            notebookType: notebookType.type,
            ...widgetOptions
        };
    }

    matches(selectors: readonly NotebookFileSelector[], resource: URI): boolean {
        return selectors.some(selector => this.selectorMatches(selector, resource));
    }

    selectorMatches(selector: NotebookFileSelector, resource: URI): boolean {
        return !!selector.filenamePattern
            && match(selector.filenamePattern, resource.path.name + resource.path.ext);
    }
}
