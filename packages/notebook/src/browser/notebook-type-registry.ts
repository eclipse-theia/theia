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

import { Disposable, DisposableCollection } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { DefaultOpenerService, OpenWithService } from '@theia/core/lib/browser';
import { NotebookTypeDescriptor } from '../common/notebook-protocol';
import { NotebookOpenHandlerFactory } from './notebook-open-handler';

@injectable()
export class NotebookTypeRegistry {

    @inject(DefaultOpenerService)
    protected readonly defaultOpenerService: DefaultOpenerService;

    @inject(OpenWithService)
    protected readonly openWithService: OpenWithService;

    @inject(NotebookOpenHandlerFactory)
    protected readonly notebookOpenHandlerFactory: NotebookOpenHandlerFactory;

    private readonly _notebookTypes: NotebookTypeDescriptor[] = [];

    get notebookTypes(): readonly NotebookTypeDescriptor[] {
        return this._notebookTypes;
    }

    registerNotebookType(type: NotebookTypeDescriptor, providerName: string): Disposable {
        const toDispose = new DisposableCollection();
        toDispose.push(Disposable.create(() => {
            this._notebookTypes.splice(this._notebookTypes.indexOf(type), 1);
        }));
        this._notebookTypes.push(type);
        const handler = this.notebookOpenHandlerFactory(type);
        toDispose.push(this.defaultOpenerService.addHandler(handler));
        toDispose.push(this.openWithService.registerHandler({
            id: type.type,
            label: type.displayName,
            providerName,
            canHandle: uri => handler.canHandle(uri) as number,
            open: uri => handler.open(uri)
        }));
        return toDispose;
    }
}
