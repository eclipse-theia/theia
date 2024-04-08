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
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { NotebookFileSelector, NotebookTypeDescriptor } from '../common/notebook-protocol';
import { NotebookEditorWidget } from './notebook-editor-widget';
import { match } from '@theia/core/lib/common/glob';
import { NotebookEditorWidgetOptions } from './notebook-editor-widget-factory';

export const NotebookOpenHandlerFactory = Symbol('NotebookOpenHandlerFactory');
export type NotebookOpenHandlerFactory = (notebookType: NotebookTypeDescriptor) => NotebookOpenHandler;

@injectable()
export class NotebookOpenHandler extends NavigatableWidgetOpenHandler<NotebookEditorWidget> {

    id: string;

    @inject(NotebookTypeDescriptor)
    protected notebookType: NotebookTypeDescriptor;

    @postConstruct()
    protected override init(): void {
        super.init();
        this.id = `notebook-open-handler-${this.notebookType.type}`;
    }

    canHandle(uri: URI, options?: WidgetOpenerOptions | undefined): MaybePromise<number> {
        if (this.notebookType.selector && this.matches(this.notebookType.selector, uri)) {
            return this.notebookType.priority === 'option' ? 100 : 200;
        } else {
            return 0;
        }
    }

    protected override createWidgetOptions(uri: URI, options?: WidgetOpenerOptions | undefined): NotebookEditorWidgetOptions {
        const widgetOptions = super.createWidgetOptions(uri, options);
        return {
            notebookType: this.notebookType.type,
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
