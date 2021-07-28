/********************************************************************************
 * Copyright (c) 2021 SAP SE or an SAP affiliate company and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { QuickEditorService, filterItems } from '@theia/core/lib/browser';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class MonacoQuickEditorService extends QuickEditorService implements monaco.quickInput.IQuickAccessDataService {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    registerQuickAccessProvider(): void {
        monaco.platform.Registry.as<monaco.quickInput.IQuickAccessRegistry>('workbench.contributions.quickaccess').registerQuickAccessProvider({
            ctor: EditorQuickAccessProvider,
            prefix: EditorQuickAccessProvider.PREFIX,
            placeholder: '',
            helpEntries: [{ description: 'Show All Opened Editors', needsEditor: false }]
        });
        EditorQuickAccessProvider.dataService = this as monaco.quickInput.IQuickAccessDataService;
    }

    getPicks(filter: string, token: monaco.CancellationToken): monaco.quickInput.Picks<monaco.quickInput.IAnythingQuickPickItem> {
        const editorItems: Array<monaco.quickInput.IAnythingQuickPickItem> = [];

        // Get the alphabetically sorted list of URIs of all currently opened editor widgets.
        const widgets: URI[] = this.editorManager.all
            .map((w: EditorWidget) => w.editor.uri)
            .sort();

        if (widgets.length === 0) {
            editorItems.push(({
                label: 'List of opened editors is currently empty'
            }));
        } else {
            for (const uri of widgets) {
                const item = this.toItem(uri);
                editorItems.push(item);
            }
        }

        return filterItems(editorItems.slice(), filter);
    }

    protected toItem(uri: URI): monaco.quickInput.IAnythingQuickPickItem {
        const description = this.labelProvider.getLongName(uri.parent);
        const icon = this.labelProvider.getIcon(uri);
        const iconClasses = icon === '' ? undefined : [icon + ' file-icon'];

        return {
            label: this.labelProvider.getName(uri),
            description: description,
            iconClasses,
            ariaLabel: uri.path.toString(),
            resource: uri,
            alwaysShow: true,
            accept: () => this.openFile(uri)
        };
    }

    protected openFile(uri: URI): void {
        this.openerService.getOpener(uri)
            .then(opener => opener.open(uri));
    }
}

export class EditorQuickAccessProvider extends monaco.quickInput.PickerQuickAccessProvider<monaco.quickInput.IQuickPickItem> {
    static PREFIX = 'edt ';
    static dataService: monaco.quickInput.IQuickAccessDataService;

    private static readonly NO_RESULTS_PICK: monaco.quickInput.IAnythingQuickPickItem = {
        label: 'No matching results'
    };

    constructor() {
        super(EditorQuickAccessProvider.PREFIX, {
            canAcceptInBackground: true,
            noResultsPick: EditorQuickAccessProvider.NO_RESULTS_PICK
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getPicks(filter: string, disposables: any, token: monaco.CancellationToken): monaco.quickInput.Picks<monaco.quickInput.IAnythingQuickPickItem>
        | Promise<monaco.quickInput.Picks<monaco.quickInput.IAnythingQuickPickItem>>
        | monaco.quickInput.FastAndSlowPicks<monaco.quickInput.IAnythingQuickPickItem>
        | null {
        return EditorQuickAccessProvider.dataService?.getPicks(filter, token);
    }
}
