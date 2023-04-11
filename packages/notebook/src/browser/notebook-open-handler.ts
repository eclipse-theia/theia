// *****************************************************************************
// Copyright (C) 2023 Red Hat, Inc. and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************
import { URI, MaybePromise } from '@theia/core';
import { NavigatableWidgetOpenHandler, NavigatableWidgetOptions, WidgetOpenerOptions } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { NotebookFileSelector, NotebookType } from '../common/notebook-protocol';
import { NotebookTypeRegistry } from './notebook-type-registry';
import { NotebookEditorWidget } from './notebook-editor-widget';
import { match } from '@theia/core/lib/common/glob';

@injectable()
export class NotebookOpenHandler extends NavigatableWidgetOpenHandler<NotebookEditorWidget> {
    /**
     * flag for activating notebook support
     * TODO remove when notbook support is functional
     */
    private static readonly EXPERIMENTAL_NOTEBOOK_SUPPORT_ACTIVE = false;

    id: string = 'notebook';

    // chache is mostly important because we need the contribution again in createWidgetOptions.
    // This way we don't have to go through all selectors again.
    private readonly matchedNotebookTypes: Map<string, NotebookType> = new Map();

    constructor(@inject(NotebookTypeRegistry) private notebookTypeRegistry: NotebookTypeRegistry) {
        super();
    }

    canHandle(uri: URI, options?: WidgetOpenerOptions | undefined): MaybePromise<number> {
        if (!NotebookOpenHandler.EXPERIMENTAL_NOTEBOOK_SUPPORT_ACTIVE) {
            return -1;
        }

        const cachedNotebookType = this.matchedNotebookTypes.get(uri.toString());
        if (cachedNotebookType) {
            return this.calcPriority(cachedNotebookType);
        }

        const [notebookType, priority] = this.notebookTypeRegistry.notebookTypes.
            filter(notebook => notebook.selector && this.matches(notebook.selector, uri))
            .map(notebook => [notebook, this.calcPriority(notebook)] as [NotebookType, number])
            .reduce((notebook, current) => current[1] > notebook[1] ? current : notebook);
        if (priority >= 0) {
            this.matchedNotebookTypes.set(uri.toString(), notebookType);
        }
        return priority;
    }

    protected calcPriority(notebookType: NotebookType | undefined): number {
        if (!notebookType) {
            return -1;
        }
        return notebookType?.priority === 'option' ? 100 : 200;
    }

    protected override createWidgetOptions(uri: URI, options?: WidgetOpenerOptions | undefined): NavigatableWidgetOptions & { notebookType: string } {
        const widgetOptions = super.createWidgetOptions(uri, options);
        const notebookType = this.matchedNotebookTypes.get(uri.toString())!;
        return {
            notebookType: notebookType.type,
            ...widgetOptions
        };
    }

    matches(selectors: readonly NotebookFileSelector[], resource: URI): boolean {
        return selectors.some(selector => this.selectorMatches(selector, resource));
    }

    selectorMatches(selector: NotebookFileSelector, resource: URI): boolean {
        if (selector.filenamePattern) {
            if (match(selector.filenamePattern.toLowerCase(), resource.path.name.toLowerCase() + resource.path.ext.toLowerCase())) {
                return true;
            }
        }
        return false;
    }
}
