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
import { WidgetOpenerOptions, WidgetOpenHandler } from '@theia/core/lib/browser';
import { inject } from '@theia/core/shared/inversify';
import { NotebookFileSelector } from '../common/notebook-protocol';
import { NotebookTypeRegistry } from './notebookTypeRegistry';
import { NotebookWidget } from './notebookWidget';
import { match } from '@theia/core/lib/common/glob';

export class NotebookOpenHandler extends WidgetOpenHandler<NotebookWidget> {
    id: string;

    constructor(@inject(NotebookTypeRegistry) private notebookTypeRegistry: NotebookTypeRegistry) {
        super();
    }

    canHandle(uri: URI, options?: WidgetOpenerOptions | undefined): MaybePromise<number> {
        console.log('can handle ' + uri.toString());
        for (const notebookType of this.notebookTypeRegistry.notebookTypes) {
            if (notebookType.selector && this.matches(notebookType.selector, uri)) {
                return notebookType.priority === 'option' ? 100 : 200;
            }
        }
        return -1;
    }

    protected createWidgetOptions(uri: URI, options?: WidgetOpenerOptions | undefined): Object {
        throw new Error('Method not implemented.');
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
