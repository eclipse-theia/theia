/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { injectable, inject } from 'inversify';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { toArray } from '@phosphor/algorithm';

@injectable()
export class ViewColumnService {
    private readonly columnValues = new Map<string, number>();
    private readonly viewColumnIds = new Map<number, string[]>();

    protected readonly onViewColumnChangedEmitter = new Emitter<{ id: string, viewColumn: number }>();

    constructor(
        @inject(ApplicationShell) private readonly shell: ApplicationShell,
    ) {
        let oldColumnValues = new Map<string, number>();
        const update = async () => {
            await new Promise((resolve => setTimeout(() => resolve())));
            this.updateViewColumns();
            this.viewColumnIds.forEach((ids: string[], viewColumn: number) => {
                ids.forEach((id: string) => {
                    if (!oldColumnValues.has(id) || oldColumnValues.get(id) !== viewColumn) {
                        this.onViewColumnChangedEmitter.fire({ id, viewColumn });
                    }
                });
            });
            oldColumnValues = new Map(this.columnValues.entries());
        };
        this.shell.mainPanel.widgetAdded.connect(() => update());
        this.shell.mainPanel.widgetRemoved.connect(() => update());
    }

    get onViewColumnChanged(): Event<{ id: string, viewColumn: number }> {
        return this.onViewColumnChangedEmitter.event;
    }

    updateViewColumns(): void {
        const positionIds = new Map<number, string[]>();
        toArray(this.shell.mainPanel.tabBars()).forEach(tabBar => {
            if (!tabBar.node.style.left) {
                return;
            }
            const position = parseInt(tabBar.node.style.left);
            const viewColumnIds = tabBar.titles.map(title => title.owner.id);
            positionIds.set(position, viewColumnIds);
        });
        this.columnValues.clear();
        this.viewColumnIds.clear();
        [...positionIds.keys()].sort((a, b) => a - b).forEach((key: number, viewColumn: number) => {
            positionIds.get(key)!.forEach((id: string) => {
                this.columnValues.set(id, viewColumn);
                if (!this.viewColumnIds.has(viewColumn)) {
                    this.viewColumnIds.set(viewColumn, []);
                }
                this.viewColumnIds.get(viewColumn)!.push(id);
            });
        });
    }

    getViewColumnIds(viewColumn: number): string[] {
        return this.viewColumnIds.get(viewColumn) || [];
    }

    getViewColumn(id: string): number | undefined {
        return this.columnValues.get(id);
    }

    hasViewColumn(id: string): boolean {
        return this.columnValues.has(id);
    }

    viewColumnsSize(): number {
        return this.viewColumnIds.size;
    }
}
