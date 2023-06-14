/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { DebugScope, DebugVariable } from '@theia/debug/lib/browser/console/debug-console-items';
import { DebugSession } from '@theia/debug/lib/browser/debug-session';
import { hexStrToUnsignedLong } from '../../common/util';
import { VariableRange } from '../utils/memory-widget-variable-utils';
import { AbstractMemoryProvider } from './memory-provider';

/**
 * @file this file exists to show the customizations possible for specific debug adapters. Within the confines of the DebugAdapterProtocol, different adapters can behave
 * quite differently. In particular, they can differ in the kinds of expressions that they treat as references (in the `memoryReference` field of MemoryReadArguments, for example)
 * and the kinds of expressions that they can evaluate (for example to assist in determining the size of variables). The `MemoryProvider` type exists to allow applications
 * to enhance the base functionality of the Memory Inspector by tapping into specifics of known adapters.
 */

/**
 * Read memory through the current debug session, using the cdt-gdb-adapter
 * extension to read memory.
 */
@injectable()
export class CDTGDBMemoryProvider extends AbstractMemoryProvider {

    canHandle(session: DebugSession): boolean {
        return session.configuration.type === 'gdb';
    }

    override async getLocals(session: DebugSession | undefined): Promise<VariableRange[]> {
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
                    }).catch(e => { console.warn(`Failed to evaluate ${addrExp}. Corresponding variable will be omitted from Memory Inspector display.`, e); });
                    if (!addrResp) { continue; }

                    const sizeResp = await session.sendRequest('evaluate', {
                        expression: sizeExp,
                        context: 'watch',
                        frameId: frame.raw.id,
                    }).catch(e => { console.warn(`Failed to evaluate ${sizeExp}. Corresponding variable will be omitted from Memory Inspector display.`, e); });
                    if (!sizeResp) { continue; }

                    // Make sure the address is in the format we expect.
                    const addressPart = /0x[0-9a-f]+/i.exec(addrResp.body.result);
                    if (!addressPart) { continue; }

                    if (!/^[0-9]+$/.test(sizeResp.body.result)) { continue; }

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

    override supportsVariableReferenceSyntax(session: DebugSession, currentLevel?: DebugVariable): boolean {
        if (this.canHandle(session)) {
            if (!currentLevel) {
                return false;
            }
            while (currentLevel.parent instanceof DebugVariable) {
                currentLevel = currentLevel.parent;
            }
            return currentLevel.parent instanceof DebugScope && currentLevel.parent['raw'].name === 'Local';
        }
        return false;
    }

    override formatVariableReference(session: DebugSession, currentLevel?: DebugVariable): string {
        if (currentLevel && this.canHandle(session)) {
            let { name } = currentLevel;
            while (currentLevel.parent instanceof DebugVariable) {
                const separator = name.startsWith('[') ? '' : '.';
                currentLevel = currentLevel.parent;
                if (name.startsWith(`*${currentLevel.name}.`)) { // Theia has added a layer of pointer dereferencing
                    name = name.replace(`*${currentLevel.name}.`, `(*${currentLevel.name})->`);
                } else if (name.startsWith(`*${currentLevel.name}`)) {
                    // that's fine, it's what you clicked on and probably what you want to see.
                } else {
                    name = `${currentLevel.name}${separator}${name}`;
                }
            }
            return `&(${name})`;
        }
        return '';
    }
}
