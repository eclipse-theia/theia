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

import { DebugSession } from '@theia/debug/lib/browser/debug-session';
import { DebugVariable } from '@theia/debug/lib/browser/console/debug-console-items';
import * as Long from 'long';
import { hexStrToUnsignedLong } from '../../common/util';

export interface VariableRange {
    name: string;
    address: Long;
    pastTheEndAddress: Long;
    type?: string;
    value?: string;
}

export interface VariableDecoration {
    name: string;
    color: string;
    firstAppearance?: boolean;
}

export interface RegisterReadResult {
    threadId: string | undefined;
    registers: DebugVariable[];
}

/* eslint-disable no-await-in-loop */
/**
 * Get the local variables of the currently selected frame.
 */
export async function getLocals(session: DebugSession | undefined): Promise<VariableRange[]> {
    if (session === undefined) {
        console.warn('No active debug session.');
        return [];
    }

    const frame = session.currentFrame;
    if (frame === undefined) {
        throw new Error('No active stack frame.');
    }

    const ranges: VariableRange[] = [];

    const scopes = await frame.getScopes();
    const scopesWithoutRegisters = scopes.filter(x => x.render() !== 'Registers');
    for (const scope of scopesWithoutRegisters) {
        const variables = await scope.getElements();
        for (const v of variables) {
            if (v instanceof DebugVariable) {
                const addrExp = `&${v.name}`;
                const sizeExp = `sizeof(${v.name})`;
                const addrResp = await session.sendRequest('evaluate', {
                    expression: addrExp,
                    context: 'watch',
                    frameId: frame.raw.id,
                });
                const sizeResp = await session.sendRequest('evaluate', {
                    expression: sizeExp,
                    context: 'watch',
                    frameId: frame.raw.id,
                });

                // Make sure the address is in the format we expect.
                const addressPart = /0x[0-9a-f]+/i.exec(addrResp.body.result);
                if (!addressPart) {
                    continue;
                }

                if (!/^[0-9]+$/.test(sizeResp.body.result)) {
                    continue;
                }

                const size = parseInt(sizeResp.body.result);
                const address = hexStrToUnsignedLong(addressPart[0]);
                const pastTheEndAddress = address.add(size);

                ranges.push({
                    name: v.name,
                    address,
                    pastTheEndAddress,
                    type: v.type,
                    value: v.value,
                });
            }
        }
    }

    return ranges;
}

// const HSL_BASIS = 360;

export class VariableFinder {
    protected readonly HIGH_CONTRAST_COLORS = [
        'var(--theia-contrastActiveBorder)',
        'var(--theia-contrastBorder)',
    ];

    protected readonly NON_HC_COLORS = [
        'var(--theia-terminal-ansiBlue)',
        'var(--theia-terminal-ansiGreen)',
        'var(--theia-terminal-ansiRed)',
        'var(--theia-terminal-ansiYellow)',
        'var(--theia-terminal-ansiMagenta)',
    ];

    protected readonly variables: VariableRange[];
    private currentIndex = -1;
    private currentVariable: VariableRange | undefined = undefined;
    private handledVariables = new Map<string, Long>();
    private workingColors: string[];
    private lastCall = Long.MAX_UNSIGNED_VALUE;

    constructor(variables: VariableRange[], highContrast = false) {
        this.variables = variables.sort((a, b) => a.address.lessThan(b.address) ? -1 : 1);
        this.workingColors = highContrast ? this.HIGH_CONTRAST_COLORS : this.NON_HC_COLORS;
    }

    /**
     * @param address the address of interest.
     *
     * This function should be called with a sequence of addresses in increasing order
     */
    getVariableForAddress(address: Long): VariableDecoration | undefined {
        if (address.lessThan(this.lastCall)) {
            this.initialize(address);
        }
        this.lastCall = address;
        if (this.currentVariable && address.greaterThanOrEqual(this.currentVariable.pastTheEndAddress)) {
            this.currentIndex += 1;
            this.currentVariable = this.variables[this.currentIndex];
        }
        if (!this.currentVariable) {
            return undefined;
        }
        const { name } = this.currentVariable;
        // const color = `hsl(${HSL_BASIS * this.currentIndex / this.variables.length}, 60%, 60%)`;
        const color = this.workingColors[this.currentIndex % this.workingColors.length];
        const decoration: VariableDecoration = {
            name,
            color,
            firstAppearance: this.handledVariables.get(name) === address || !this.handledVariables.has(name),
        };
        if (address.greaterThanOrEqual(this.currentVariable.address) && address.lessThan(this.currentVariable.pastTheEndAddress)) {
            this.handledVariables.set(name, address);
            return decoration;
        }
        return undefined;
    }

    protected initialize(address: Long): void {
        this.handledVariables.clear();
        const firstCandidateIndex = this.variables.findIndex(variable => address.lessThan(variable.pastTheEndAddress));
        if (firstCandidateIndex === -1) {
            this.currentIndex = this.variables.length;
        } else {
            this.currentVariable = this.variables[firstCandidateIndex];
            this.currentIndex = firstCandidateIndex;
        }
    }

    searchForVariable(addressOrName: Long | string): VariableRange | undefined {
        if (typeof addressOrName === 'string') {
            return this.variables.find(variable => variable.name === addressOrName);
        }
        let upperLimit = this.variables.length - 1;
        let lowerLimit = 0;
        while (upperLimit >= lowerLimit) {
            const target = Math.floor((lowerLimit + upperLimit) / 2);
            const candidate = this.variables[target];
            if (addressOrName >= candidate.address && addressOrName < candidate.pastTheEndAddress) {
                return candidate;
            }
            if (addressOrName < candidate.address) {
                upperLimit = target - 1;
            }
            if (addressOrName >= candidate.pastTheEndAddress) {
                lowerLimit = target + 1;
            }
        }
        return undefined;
    }
}

/**
 * Get the Registers of the currently selected frame.
 */
export async function getRegisters(session: DebugSession | undefined): Promise<DebugVariable[]> {
    if (session === undefined) {
        console.warn('No active debug session.');
        return [];
    }

    const frame = session.currentFrame;
    if (frame === undefined) {
        throw new Error('No active stack frame.');
    }

    const registers: DebugVariable[] = [];

    const scopes = await frame.getScopes();
    const regScope = scopes.find(x => x.render() === 'Registers');
    if (regScope !== undefined) {
        const variables = await regScope.getElements();
        for (const v of variables) {
            if (v instanceof DebugVariable) {
                registers.push(v);
            }
        }
    } else {
        throw new Error('No Register scope in active stack frame.');
    }
    return registers;
}

