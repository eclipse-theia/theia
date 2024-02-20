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

import { Disposable, Path } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { NotebookRendererDescriptor } from '../common/notebook-protocol';

export interface NotebookRendererInfo {
    readonly id: string;
    readonly displayName: string;
    readonly mimeTypes: string[];
    readonly entrypoint: { readonly extends?: string; readonly uri: string };
    readonly requiresMessaging: boolean;
}

export interface NotebookPreloadInfo {
    readonly type: string;
    readonly entrypoint: string;
}

@injectable()
export class NotebookRendererRegistry {

    private readonly _notebookRenderers: NotebookRendererInfo[] = [];

    get notebookRenderers(): readonly NotebookRendererInfo[] {
        return this._notebookRenderers;
    }

    private readonly _staticNotebookPreloads: NotebookPreloadInfo[] = [];

    get staticNotebookPreloads(): readonly NotebookPreloadInfo[] {
        return this._staticNotebookPreloads;
    }

    registerNotebookRenderer(type: NotebookRendererDescriptor, basePath: string): Disposable {
        let entrypoint;
        if (typeof type.entrypoint === 'string') {
            entrypoint = {
                uri: new Path(basePath).join(type.entrypoint).toString()
            };
        } else {
            entrypoint = {
                uri: new Path(basePath).join(type.entrypoint.path).toString(),
                extends: type.entrypoint.extends
            };
        }

        this._notebookRenderers.push({
            ...type,
            mimeTypes: type.mimeTypes || [],
            requiresMessaging: type.requiresMessaging === 'always' || type.requiresMessaging === 'optional',
            entrypoint
        });
        return Disposable.create(() => {
            this._notebookRenderers.splice(this._notebookRenderers.findIndex(renderer => renderer.id === type.id), 1);
        });
    }

    registerStaticNotebookPreload(type: string, entrypoint: string, basePath: string): Disposable {
        const staticPreload = { type, entrypoint: new Path(basePath).join(entrypoint).toString() };
        this._staticNotebookPreloads.push(staticPreload);
        return Disposable.create(() => {
            this._staticNotebookPreloads.splice(this._staticNotebookPreloads.indexOf(staticPreload), 1);
        });
    }
}

