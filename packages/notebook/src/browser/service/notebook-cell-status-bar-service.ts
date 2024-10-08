// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { CancellationToken, Command, Disposable, Emitter, Event, URI } from '@theia/core';
import { CellStatusbarAlignment } from '../../common';
import { ThemeColor } from '@theia/core/lib/common/theme';
import { AccessibilityInformation } from '@theia/core/lib/common/accessibility';
import { injectable } from '@theia/core/shared/inversify';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';

export interface NotebookCellStatusBarItem {
    readonly alignment: CellStatusbarAlignment;
    readonly priority?: number;
    readonly text: string;
    readonly color?: string | ThemeColor;
    readonly backgroundColor?: string | ThemeColor;
    readonly tooltip?: string | MarkdownString;
    readonly command?: string | (Command & { arguments?: unknown[] });
    readonly accessibilityInformation?: AccessibilityInformation;
    readonly opacity?: string;
    readonly onlyShowWhenActive?: boolean;
}
export interface NotebookCellStatusBarItemList {
    items: NotebookCellStatusBarItem[];
    dispose?(): void;
}

export interface NotebookCellStatusBarItemProvider {
    viewType: string;
    onDidChangeStatusBarItems?: Event<void>;
    provideCellStatusBarItems(uri: URI, index: number, token: CancellationToken): Promise<NotebookCellStatusBarItemList | undefined>;
}

@injectable()
export class NotebookCellStatusBarService implements Disposable {

    protected readonly onDidChangeProvidersEmitter = new Emitter<void>();
    readonly onDidChangeProviders: Event<void> = this.onDidChangeProvidersEmitter.event;

    protected readonly onDidChangeItemsEmitter = new Emitter<void>();
    readonly onDidChangeItems: Event<void> = this.onDidChangeItemsEmitter.event;

    protected readonly providers: NotebookCellStatusBarItemProvider[] = [];

    registerCellStatusBarItemProvider(provider: NotebookCellStatusBarItemProvider): Disposable {
        this.providers.push(provider);
        let changeListener: Disposable | undefined;
        if (provider.onDidChangeStatusBarItems) {
            changeListener = provider.onDidChangeStatusBarItems(() => this.onDidChangeItemsEmitter.fire());
        }

        this.onDidChangeProvidersEmitter.fire();

        return Disposable.create(() => {
            changeListener?.dispose();
            const idx = this.providers.findIndex(p => p === provider);
            this.providers.splice(idx, 1);
        });
    }

    async getStatusBarItemsForCell(notebookUri: URI, cellIndex: number, viewType: string, token: CancellationToken): Promise<NotebookCellStatusBarItemList[]> {
        const providers = this.providers.filter(p => p.viewType === viewType || p.viewType === '*');
        return Promise.all(providers.map(async p => {
            try {
                return await p.provideCellStatusBarItems(notebookUri, cellIndex, token) ?? { items: [] };
            } catch (e) {
                console.error(e);
                return { items: [] };
            }
        }));
    }

    dispose(): void {
        this.onDidChangeItemsEmitter.dispose();
        this.onDidChangeProvidersEmitter.dispose();
    }
}
