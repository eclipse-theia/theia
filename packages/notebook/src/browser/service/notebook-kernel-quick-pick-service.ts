
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickService } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { NotebookKernelService, NotebookKernel } from './notebook-kernel-service';
import { NotebookModel } from '../view-model/notebook-model';

@injectable()
export class NotebookKernelQuickPickService {

    @inject(QuickPickService)
    protected quickPickService: QuickPickService;

    @inject(NotebookKernelService)
    protected notebookKernelService: NotebookKernelService;

    async showQuickPick(notebook: NotebookModel): Promise<string | undefined> {
        return (await this.quickPickService.show(this.getKernels(notebook).map(kernel => ({ id: kernel.id, label: kernel.label }))))?.id;
    }

    protected getKernels(notebook: NotebookModel): NotebookKernel[] {
        return this.notebookKernelService.getMatchingKernel(notebook).all;
    }
}
