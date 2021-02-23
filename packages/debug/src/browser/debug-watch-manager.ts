/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common/event';
import { StorageService } from '@theia/core/lib/browser/storage-service';

@injectable()
export class DebugWatchManager {

    @inject(StorageService)
    protected readonly storage: StorageService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    protected idSequence = 0;
    protected readonly _watchExpressions = new Map<number, string>();

    get watchExpressions(): IterableIterator<[number, string]> {
        return this._watchExpressions.entries();
    }

    addWatchExpression(expression: string): number {
        const id = this.idSequence++;
        this._watchExpressions.set(id, expression);
        this.onDidChangeEmitter.fire(undefined);
        return id;
    }

    removeWatchExpression(id: number): boolean {
        if (!this._watchExpressions.has(id)) {
            return false;
        }
        this._watchExpressions.delete(id);
        this.onDidChangeEmitter.fire(undefined);
        return true;
    }

    removeWatchExpressions(): void {
        if (this._watchExpressions.size) {
            this.idSequence = 0;
            this._watchExpressions.clear();
            this.onDidChangeEmitter.fire(undefined);
        }
    }

    async load(): Promise<void> {
        const data = await this.storage.getData<DebugWatchData>(this.storageKey, {
            expressions: []
        });
        this.restoreState(data);
    }

    save(): void {
        const data = this.storeState();
        this.storage.setData(this.storageKey, data);
    }

    protected get storageKey(): string {
        return 'debug:watch';
    }

    protected storeState(): DebugWatchData {
        return {
            expressions: [...this._watchExpressions.values()]
        };
    }

    protected restoreState(state: DebugWatchData): void {
        for (const expression of state.expressions) {
            this.addWatchExpression(expression);
        }
    }

}

export interface DebugWatchData {
    readonly expressions: string[];
}
