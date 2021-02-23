/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { interfaces } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import * as types from '../../plugin/types-impl';
import { StatusBarMessageRegistryMain } from '../../common/plugin-api-rpc';
import { StatusBar, StatusBarAlignment, StatusBarEntry } from '@theia/core/lib/browser/status-bar/status-bar';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';

export class StatusBarMessageRegistryMainImpl implements StatusBarMessageRegistryMain, Disposable {
    private readonly delegate: StatusBar;
    private readonly entries = new Map<string, StatusBarEntry>();
    private readonly toDispose = new DisposableCollection(
        Disposable.create(() => { /* mark as not disposed */ })
    );

    protected readonly colorRegistry: ColorRegistry;

    constructor(container: interfaces.Container) {
        this.delegate = container.get(StatusBar);
        this.colorRegistry = container.get(ColorRegistry);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    async $setMessage(id: string,
        text: string | undefined,
        priority: number,
        alignment: number,
        color: string | undefined,
        tooltip: string | undefined,
        command: string | undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: any[] | undefined): Promise<void> {
        const entry = {
            text: text || '',
            priority,
            alignment: alignment === types.StatusBarAlignment.Left ? StatusBarAlignment.LEFT : StatusBarAlignment.RIGHT,
            color: color && (this.colorRegistry.getCurrentColor(color) || color),
            tooltip,
            command,
            args
        };

        this.entries.set(id, entry);
        await this.delegate.setElement(id, entry);
        if (this.toDispose.disposed) {
            this.$dispose(id);
        } else {
            this.toDispose.push(Disposable.create(() => this.$dispose(id)));
        }
    }

    $dispose(id: string): void {
        const entry = this.entries.get(id);
        if (entry) {
            this.entries.delete(id);
            this.delegate.removeElement(id);
        }
    }

}
