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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import * as Long from 'long';
import { VariableRange, VariableDecoration } from './memory-widget-variable-utils';

export namespace Constants {
    export const DEBOUNCE_TIME = 200;
    export const ERROR_TIMEOUT = 5000;
}
export namespace Utils {
    export const validateNumericalInputs = (e: React.ChangeEvent<HTMLInputElement>, allowNegative = true): void => {
        const toReplace = allowNegative ? /[^\d-]/g : /[^\d]/g;
        e.target.value = e.target.value.replace(toReplace, '');
    };

    export const isPrintableAsAscii = (byte: number): boolean => byte >= 32 && byte < (128 - 1);
}

export namespace Interfaces {
    export interface MemoryReadResult {
        bytes: LabeledUint8Array;
        address: Long;
    }
    export interface WidgetMemoryState extends MemoryReadResult {
        variables: VariableRange[];
    }

    export interface MemoryOptions {
        address: string | number;
        offset: number;
        length: number;
        byteSize: number;
        bytesPerGroup: number;
        groupsPerRow: number;
        endianness: Endianness;
        doDisplaySettings: boolean;
        doUpdateAutomatically: boolean;
        columnsDisplayed: ColumnsDisplayed;
        recentLocationsArray: string[];
        isFrozen: boolean;
    }
    export interface MoreMemoryOptions {
        numBytes: number;
        direction: 'above' | 'below';
    }

    export enum Endianness {
        Little = 'Little Endian',
        Big = 'Big Endian'
    }
    export interface LabeledUint8Array extends Uint8Array {
        label?: string;
    }

    export interface StylableNodeAttributes {
        className?: string;
        style?: React.CSSProperties;
        variable?: VariableDecoration;
        title?: string;
        isHighlighted?: boolean;
    }

    export interface FullNodeAttributes extends StylableNodeAttributes {
        content: string;
    }

    export interface BitDecorator {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (...args: any[]): Partial<FullNodeAttributes>;
    }
    export interface RowDecorator {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (...args: any[]): Partial<StylableNodeAttributes>;
    }
    export interface ByteFromChunkData {
        address: Long;
        /**
         * A single eight-bit byte
         */
        value: string;
    }

    export interface Column {
        label: string;
        doRender: boolean;
    }

    export interface ColumnIDs {
        label: string;
        id: string;
    }

    export interface ColumnsDisplayed {
        [id: string]: Column;
    }
}

export const MemoryWidgetOptions = Symbol('MemoryWidgetOptions');
export interface MemoryWidgetOptions {
    identifier: string | number;
    displayId?: string | number;
    dynamic?: boolean;
}

export const MemoryDiffWidgetData = Symbol('MemoryDiffWidgetData');
export interface MemoryDiffWidgetData extends MemoryWidgetOptions {
    beforeAddress: Long;
    beforeBytes: Interfaces.LabeledUint8Array;
    beforeVariables: VariableRange[];
    afterAddress: Long;
    afterBytes: Interfaces.LabeledUint8Array;
    afterVariables: VariableRange[];
    dynamic: false;
    titles: [string, string];
}

export const RegisterWidgetOptions = Symbol('RegisterWidgetData');
export type RegisterWidgetOptions = MemoryWidgetOptions;
