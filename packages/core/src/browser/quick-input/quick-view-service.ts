// *****************************************************************************
// Copyright (C) 2021 SAP SE or an SAP affiliate company and others.
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

import { inject, injectable, postConstruct } from 'inversify';
import { filterItems, QuickPickItem, QuickPickSeparator, QuickPicks } from '..';
import { CancellationToken, Disposable } from '../../common';
import { ContextKeyService } from '../context-key-service';
import { QuickAccessContribution, QuickAccessProvider, QuickAccessRegistry } from './quick-access';
import { ApplicationShell, WidgetArea } from '../shell';

export interface QuickViewItem {
    readonly label: string;
    readonly viewId: string;
    readonly location: string;
    readonly when?: string;
    readonly open: () => void;
}

@injectable()
export class QuickViewService implements QuickAccessContribution, QuickAccessProvider {
    static PREFIX = 'view ';

    protected readonly items: (QuickPickItem & {
        viewId: string,
        location: string,
        defaultLocation: string,
        viewContainerTitle?: string,
        when?: string
    })[] = [];
    protected readonly containers = new Map<string, string>();
    private hiddenItemLabels = new Set<string | undefined>();

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(QuickAccessRegistry)
    protected readonly quickAccessRegistry: QuickAccessRegistry;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @postConstruct()
    init(): void {
        this.shell.onDidAddWidget(widget => {
            const item = this.items.find(i => i.viewId === widget.id);
            if (item) {
                item.location = widget[WidgetArea];
            }
        });

        this.shell.onDidRemoveWidget(widget => {
            const item = this.items.find(i => i.viewId === widget.id);
            if (item) {
                item.location = item.defaultLocation;
            }
        });
    }

    registerContainer(id: string, location: string, title: string): Disposable {
        const label = this.getLocationLabel(location) + ' / ' + title;
        this.containers.set(id, label);
        return Disposable.create(() => {
            this.containers.delete(id);
        });
    }

    registerItem(item: QuickViewItem): Disposable {
        const quickOpenItem = {
            label: item.label,
            viewId: item.viewId,
            location: item.location,
            defaultLocation: item.location,
            execute: () => item.open(),
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
        this.quickAccessRegistry.registerQuickAccessProvider({
            getInstance: () => this,
            prefix: QuickViewService.PREFIX,
            placeholder: '',
            helpEntries: [{ description: 'Open View', needsEditor: false }]
        });
    }

    getPicks(filter: string, token: CancellationToken): QuickPicks {
        const items = this.items.filter(item =>
            (item.when === undefined || this.contextKeyService.match(item.when)) &&
            (!this.hiddenItemLabels.has(item.label))
        );

        // Reversing is a trick to ensure any others (indexOf = -1) appear at the end of the sorted array.
        const locationOrder = [ 'left', 'bottom', 'right', 'main' ].reverse();
        const filteredItems = filterItems(items, filter)
            .sort((a, b) => a.location.localeCompare(b.location))
            .sort((a, b) => this.getLocationLabel(a.location).localeCompare(this.getLocationLabel(a.location)))
            .sort((a, b) => locationOrder.indexOf(b.location) - locationOrder.indexOf(a.location));

        let previousLocation: string | undefined;
        const itemsWithSeparators: (QuickPickSeparator|QuickPickItem)[] = [];
        for (const it of filteredItems) {
            const locationLabel = this.getLocationLabel(it.location);
            if (locationLabel !== previousLocation) {
                previousLocation = locationLabel;
                itemsWithSeparators.push({ type: 'separator', label: locationLabel });
            }
            itemsWithSeparators.push(it);
        }

        return itemsWithSeparators;
    }

    protected getLocationLabel(location: string): string {
        switch (location) {
            case 'left': return 'Side Bar';
            case 'bottom': return 'Panel';
            case 'right': return 'Right';
            case 'main': return 'Editor';
            default:
                return this.containers.get(location) ?? location;
        }
    }
}
