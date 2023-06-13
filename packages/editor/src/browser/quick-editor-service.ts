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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject } from '@theia/core/shared/inversify';
import { CancellationToken, nls, QuickPickItemOrSeparator } from '@theia/core/lib/common';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { QuickAccessProvider, QuickAccessRegistry, QuickAccessContribution } from '@theia/core/lib/browser/quick-input/quick-access';
import { filterItems, QuickPickItem, QuickPickSeparator } from '@theia/core/lib/browser/quick-input/quick-input-service';
import { ApplicationShell, NavigatableWidget, TabBar, Widget } from '@theia/core/lib/browser';

@injectable()
export class QuickEditorService implements QuickAccessContribution, QuickAccessProvider {
    static PREFIX = 'edt ';

    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(QuickAccessRegistry) protected readonly quickAccessRegistry: QuickAccessRegistry;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;

    protected groupLocalizations: string[] = [];

    registerQuickAccessProvider(): void {
        this.quickAccessRegistry.registerQuickAccessProvider({
            getInstance: () => this,
            prefix: QuickEditorService.PREFIX,
            placeholder: '',
            helpEntries: [{ description: 'Show All Opened Editors', needsEditor: false }]
        });
    }

    getPicks(filter: string, token: CancellationToken): (QuickPickItem | QuickPickSeparator)[] {
        const editorItems: QuickPickItemOrSeparator[] = [];
        const hasUri = (widget: Widget): widget is NavigatableWidget => Boolean(NavigatableWidget.getUri(widget));
        const handleWidgets = (widgets: NavigatableWidget[], label: string) => {
            if (widgets.length) {
                editorItems.push({ type: 'separator', label });
            }
            editorItems.push(...widgets.map(widget => this.toItem(widget)));
        };
        const handleSplittableArea = (tabbars: TabBar<Widget>[], labelPrefix: string) => {
            tabbars.forEach((tabbar, index) => {
                const editorsOnTabbar = tabbar.titles.reduce<NavigatableWidget[]>((widgets, title) => {
                    if (hasUri(title.owner)) {
                        widgets.push(title.owner);
                    }
                    return widgets;
                }, []);
                const label = tabbars.length > 1 ? `${labelPrefix} ${this.getGroupLocalization(index)}` : labelPrefix;
                handleWidgets(editorsOnTabbar, label);
            });
        };

        handleSplittableArea(this.shell.mainAreaTabBars, ApplicationShell.areaLabels.main);
        handleSplittableArea(this.shell.bottomAreaTabBars, ApplicationShell.areaLabels.bottom);

        for (const area of ['left', 'right'] as ApplicationShell.Area[]) {
            const editorsInArea = this.shell.getWidgets(area).filter(hasUri);
            handleWidgets(editorsInArea, ApplicationShell.areaLabels[area]);
        }

        return filterItems(editorItems.slice(), filter);
    }

    protected getGroupLocalization(index: number): string {
        return this.groupLocalizations[index] || nls.localizeByDefault('Group {0}', index + 1);
    }

    protected toItem(widget: NavigatableWidget): QuickPickItem {
        const uri = NavigatableWidget.getUri(widget)!;
        const icon = this.labelProvider.getIcon(uri);
        const iconClasses = icon === '' ? undefined : [icon + ' file-icon'];

        return {
            label: this.labelProvider.getName(uri),
            description: this.labelProvider.getDetails(uri),
            iconClasses,
            ariaLabel: uri.path.fsPath(),
            alwaysShow: true,
            execute: () => this.shell.activateWidget(widget.id),
        };
    }
}
