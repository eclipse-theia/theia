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
import { Disposable } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { NotebookRendererDescriptor } from '../common/notebook-protocol';

@injectable()
export class NotebookRendererRegistry {
    readonly notebookRenderers: NotebookRendererDescriptor[] = [];

    registerNotebookRenderer(type: NotebookRendererDescriptor): Disposable {
        this.notebookRenderers.push(type);
        return Disposable.create(() => {
            this.notebookRenderers.splice(this.notebookRenderers.indexOf(type), 1);
        });
    }

    getByMimeType(mimeType: string): NotebookRendererDescriptor[] {
        return this.notebookRenderers.filter(renderer => renderer.mimeTypes.includes(mimeType));
    }
}
