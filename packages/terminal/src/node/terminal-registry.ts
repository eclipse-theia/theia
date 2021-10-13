/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import { Disposable } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Terminal } from '@theia/process/lib/node';

/**
 * A process-global `TerminalRegistry`.
 */
export const GlobalTerminalRegistry = Symbol('GlobalTerminalRegistry');

export const TerminalRegistry = Symbol('TerminalRegistry');
export interface TerminalRegistry extends Disposable {

    /**
     * @returns Unique id.
     */
    register(terminal: Terminal): number

    unregister(id: number): boolean

    has(id: number): boolean

    get(id: number): Terminal | undefined

    /**
     * Return `terminalId` of registered `Terminal` instances.
     */
    ids(): IterableIterator<number>

    /**
     * `Terminal` instances registered to this registry.
     */
    terminals(): IterableIterator<Terminal>

    entries(): IterableIterator<[number, Terminal]>

    dispose(): void
}

/**
 * A process-global sequence of unique ids.
 */
@injectable()
export class TerminalIdSequence {
    /**
     * Start at `1` because `0` is a special value that may mean "uninitialized" for clients.
     */
    protected sequence: number = 1;
    next(): number {
        return this.sequence++;
    }
}

@injectable()
export class TerminalRegistryImpl implements TerminalRegistry {

    protected registry = new Map<number, Terminal>();

    @inject(TerminalIdSequence)
    protected terminalIdSequence: TerminalIdSequence;

    register(terminal: Terminal): number {
        const id = this.terminalIdSequence.next();
        if (terminal.exitStatus !== undefined) {
            // Terminal is already killed...
            return id;
        }
        terminal.onClose(() => { this.unregister(id); });
        this.registry.set(id, terminal);
        return id;
    }

    unregister(id: number): boolean {
        return this.registry.delete(id);
    }

    has(id: number): boolean {
        return this.registry.has(id);
    }

    get(id: number): Terminal | undefined {
        return this.registry.get(id);
    }

    ids(): IterableIterator<number> {
        return this.registry.keys();
    }

    terminals(): IterableIterator<Terminal> {
        return this.registry.values();
    }

    entries(): IterableIterator<[number, Terminal]> {
        return this.registry.entries();
    }

    dispose(): void {
        for (const terminal of this.terminals()) {
            terminal.kill();
        }
        this.registry.clear();
    }
}
