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

import { QuickHelpService } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MonacoQuickInputService } from './monaco-quick-input-service';

@injectable()
export class MonacoQuickHelpService extends QuickHelpService implements monaco.quickInput.IQuickAccessDataService {

    @inject(MonacoQuickInputService)
    protected readonly monacoQuickInputService: MonacoQuickInputService;

    registerQuickAccessProvider(): void {
        monaco.platform.Registry.as<monaco.quickInput.IQuickAccessRegistry>('workbench.contributions.quickaccess').registerQuickAccessProvider({
            ctor: HelpQuickAccessProvider,
            prefix: HelpQuickAccessProvider.PREFIX,
            placeholder: 'Type "?" to get help on the actions you can take from here.',
            helpEntries: [{ description: 'Show all Quick Access Providers', needsEditor: false }]
        });
        HelpQuickAccessProvider.dataService = this as monaco.quickInput.IQuickAccessDataService;
    }

    getPicks(filter: string, token: monaco.CancellationToken): monaco.quickInput.Picks<monaco.quickInput.IAnythingQuickPickItem> {
        const { editorProviders, globalProviders } = this.getQuickAccessProviders();
        const result = editorProviders.length === 0 || globalProviders.length === 0 ?
            // Without groups
            [
                ...(editorProviders.length === 0 ? globalProviders : editorProviders)
            ] :

            // With groups
            [
                { label: 'global commands', type: 'separator' },
                ...globalProviders,
                { label: 'editor commands', type: 'separator' },
                ...editorProviders
            ];
        return result as monaco.quickInput.Picks<monaco.quickInput.IAnythingQuickPickItem>;
    }

    private getQuickAccessProviders(): { editorProviders: monaco.quickInput.IHelpQuickAccessPickItem[], globalProviders: monaco.quickInput.IHelpQuickAccessPickItem[] } {
        const globalProviders: monaco.quickInput.IHelpQuickAccessPickItem[] = [];
        const editorProviders: monaco.quickInput.IHelpQuickAccessPickItem[] = [];

        const providers = monaco.platform.Registry.as<monaco.quickInput.IQuickAccessRegistry>('workbench.contributions.quickaccess').getQuickAccessProviders();

        for (const provider of providers.sort((providerA, providerB) => providerA.prefix.localeCompare(providerB.prefix))) {
            if (provider.prefix === HelpQuickAccessProvider.PREFIX) {
                continue; // exclude help which is already active
            }

            for (const helpEntry of provider.helpEntries) {
                const prefix = helpEntry.prefix || provider.prefix;
                const label = prefix || '\u2026' /* ... */;

                (helpEntry.needsEditor ? editorProviders : globalProviders).push({
                    prefix,
                    label,
                    ariaLabel: `${label}, ${helpEntry.description}`,
                    description: helpEntry.description,
                    accept: () => this.monacoQuickInputService.open(prefix)
                });
            }
        }

        return { editorProviders, globalProviders };
    }
}

export class HelpQuickAccessProvider extends monaco.quickInput.PickerQuickAccessProvider<monaco.quickInput.IQuickPickItem> {
    static PREFIX = '?';
    static dataService: monaco.quickInput.IQuickAccessDataService;

    private static readonly NO_RESULTS_PICK: monaco.quickInput.IAnythingQuickPickItem = {
        label: 'No matching results'
    };

    constructor() {
        super(HelpQuickAccessProvider.PREFIX, {
            canAcceptInBackground: true,
            noResultsPick: HelpQuickAccessProvider.NO_RESULTS_PICK
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected getPicks(filter: string, disposables: any, token: monaco.CancellationToken): monaco.quickInput.Picks<monaco.quickInput.IAnythingQuickPickItem>
        | Promise<monaco.quickInput.Picks<monaco.quickInput.IAnythingQuickPickItem>>
        | monaco.quickInput.FastAndSlowPicks<monaco.quickInput.IAnythingQuickPickItem>
        | null {
        return HelpQuickAccessProvider.dataService.getPicks(filter, token);
    }
}
