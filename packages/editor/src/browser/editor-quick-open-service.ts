/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable } from 'inversify';
import {
    QuickOpenModel, QuickOpenItem, QuickOpenMode, PrefixQuickOpenService,
    OpenerService, QuickOpenItemOptions,
    QuickOpenHandler, QuickOpenOptions
} from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { CancellationTokenSource } from '@theia/core/lib/common';
import { EditorManager } from './editor-manager';
import { EditorWidget } from './editor-widget';

@injectable()
export class EditorQuickOpenService implements QuickOpenModel, QuickOpenHandler {

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(PrefixQuickOpenService)
    protected readonly prefixQuickOpenService: PrefixQuickOpenService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    readonly prefix: string = 'edt ';

    get description(): string {
        return 'Show All Opened Editors';
    }

    getModel(): QuickOpenModel {
        return this;
    }

    getOptions(): QuickOpenOptions {
        return {
            fuzzyMatchLabel: {
                enableSeparateSubstringMatching: true
            },
            fuzzyMatchDescription: {
                enableSeparateSubstringMatching: true
            },
            onClose: () => {
                this.cancelIndicator.cancel();
            }
        };
    }

    open(): void {
        this.prefixQuickOpenService.open(this.prefix);
    }

    private cancelIndicator = new CancellationTokenSource();

    public async onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): Promise<void> {
        this.cancelIndicator.cancel();
        this.cancelIndicator = new CancellationTokenSource();
        const token = this.cancelIndicator.token;

        const editorItems: QuickOpenItem[] = [];

        // Get the alphabetically sorted list of URIs of all currently opened editor widgets.
        const widgets: URI[] = this.editorManager.all
            .map((w: EditorWidget) => w.editor.uri)
            .sort();

        if (widgets.length === 0) {
            editorItems.push(new QuickOpenItem({
                label: 'List of opened editors is currently empty',
                run: () => false
            }));
            acceptor(editorItems);
            return;
        }

        for (const uri of widgets) {
            const item = await this.toItem(uri);
            if (!!token.isCancellationRequested) {
                return;
            }
            editorItems.push(item);
            acceptor(editorItems);
        }
        return;
    }

    protected async toItem(uri: URI): Promise<QuickOpenItem<QuickOpenItemOptions>> {
        const description = this.labelProvider.getLongName(uri.parent);

        const options: QuickOpenItemOptions = {
            label: this.labelProvider.getName(uri),
            iconClass: await this.labelProvider.getIcon(uri) + ' file-icon',
            description: description,
            tooltip: uri.path.toString(),
            uri: uri,
            hidden: false,
            run: this.getRunFunction(uri)
        };
        return new QuickOpenItem<QuickOpenItemOptions>(options);
    }

    /**
     * Gets the function that can open the editor file
     * @param uri the file uri
     * @returns the function that opens the file if mode === QuickOpenMode.OPEN
     */
    protected getRunFunction(uri: URI): (mode: QuickOpenMode) => boolean {
        return (mode: QuickOpenMode) => {
            if (mode !== QuickOpenMode.OPEN) {
                return false;
            }
            this.openFile(uri);
            return true;
        };
    }

    protected openFile(uri: URI): void {
        this.openerService.getOpener(uri)
            .then(opener => opener.open(uri));
    }
}
