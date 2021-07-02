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
import { QuickViewItem, QuickViewService } from '@theia/core/lib/browser/quick-input/quick-view-service';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { Disposable } from '@theia/core/lib/common';
import { filterItems } from '@theia/core/lib/browser/quick-input/quick-input-service';

@injectable()
export class MonacoQuickViewService extends QuickViewService implements monaco.quickInput.IQuickAccessDataService {
    protected readonly items: (monaco.quickInput.IAnythingQuickPickItem & { when?: string })[] = [];
    private hiddenItemLabels = new Set<string | undefined>();

    @inject(ContextKeyService)
    protected readonly contextKexService: ContextKeyService;

    registerItem(item: QuickViewItem): Disposable {
        const quickOpenItem = {
            label: item.label,
            accept: () => item.open(),
            when: item.when
        };
        this.items.push(quickOpenItem);
        this.items.sort((a, b) => a.label!.localeCompare(b.label!));

        return Disposable.create(() => {
            const index = this.items.indexOf(quickOpenItem);
            if (index !== -1) {
                this.items.splice(index, 1);
            }
        });
    }

    hideItem(label: string): void {
        this.hiddenItemLabels.add(label);
    }

    showItem(label: string): void {
        this.hiddenItemLabels.delete(label);
    }

    registerQuickAccessProvider(): void {
        monaco.platform.Registry.as<monaco.quickInput.IQuickAccessRegistry>('workbench.contributions.quickaccess').registerQuickAccessProvider({
            ctor: ViewQuickAccessProvider,
            prefix: ViewQuickAccessProvider.PREFIX,
            placeholder: '',
            helpEntries: [{ description: 'Open View', needsEditor: false }]
        });
        ViewQuickAccessProvider.dataService = this as monaco.quickInput.IQuickAccessDataService;
    }

    getPicks(filter: string, token: monaco.CancellationToken): monaco.quickInput.Picks<monaco.quickInput.IAnythingQuickPickItem> {
        const items = this.items.filter(item =>
            (item.when === undefined || this.contextKexService.match(item.when)) &&
            (!this.hiddenItemLabels.has(item.label))
        );
        return filterItems(items, filter);
    }
}

export class ViewQuickAccessProvider extends monaco.quickInput.PickerQuickAccessProvider<monaco.quickInput.IQuickPickItem> {
    static PREFIX = 'view ';
    static dataService: monaco.quickInput.IQuickAccessDataService;

    private static readonly NO_RESULTS_PICK: monaco.quickInput.IAnythingQuickPickItem = {
        label: 'No matching views'
    };

    constructor() {
        super(ViewQuickAccessProvider.PREFIX, {
            canAcceptInBackground: true,
            noResultsPick: ViewQuickAccessProvider.NO_RESULTS_PICK
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getPicks(filter: string, disposables: any, token: monaco.CancellationToken): monaco.quickInput.Picks<monaco.quickInput.IAnythingQuickPickItem>
        | Promise<monaco.quickInput.Picks<monaco.quickInput.IAnythingQuickPickItem>>
        | monaco.quickInput.FastAndSlowPicks<monaco.quickInput.IAnythingQuickPickItem>
        | null {
        return ViewQuickAccessProvider.dataService?.getPicks(filter, token);
    }
}
