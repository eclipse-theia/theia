// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import { inject, injectable } from 'inversify';
import { isObject } from '../types';
import { IndexedAccess, PreferenceSchemaService } from './preference-schema';
import { escapeRegExpCharacters } from '../strings';
import { JSONValue } from '@lumino/coreutils';

export interface OverridePreferenceName {
    preferenceName: string
    overrideIdentifier: string
}
export namespace OverridePreferenceName {
    export function is(arg: unknown): arg is OverridePreferenceName {
        return isObject(arg) && 'preferenceName' in arg && 'overrideIdentifier' in arg;
    }
}

const OVERRIDE_PROPERTY = '\\[(.*)\\]$';
export const OVERRIDE_PROPERTY_PATTERN = new RegExp(OVERRIDE_PROPERTY);
export const getOverridePattern = (identifier: string) => `\\[(${identifier})\\]$`;

@injectable()
export class PreferenceLanguageOverrideService {
    @inject(PreferenceSchemaService)
    protected readonly preferenceSchemaService: PreferenceSchemaService;

    static testOverrideValue(name: string, value: unknown): value is IndexedAccess<JSONValue> {
        return isObject(value) && OVERRIDE_PROPERTY_PATTERN.test(name);
    }

    /**
     * @param overrideIdentifier the language id associated for a language override, e.g. `typescript`
     * @returns the form used to mark language overrides in preference files, e.g. `[typescript]`
     */
    markLanguageOverride(overrideIdentifier: string): string {
        return `[${overrideIdentifier}]`;
    }

    /**
     * @returns the flat JSON path to an overridden preference, e.g. [typescript].editor.tabSize.
     */
    overridePreferenceName({ preferenceName, overrideIdentifier }: OverridePreferenceName): string {
        return `${this.markLanguageOverride(overrideIdentifier)}.${preferenceName}`;
    }

    /**
     * @returns an OverridePreferenceName if the `name` contains a language override, e.g. [typescript].editor.tabSize.
     */
    overriddenPreferenceName(name: string): OverridePreferenceName | undefined {
        const index = name.indexOf('.');
        if (index === -1) {
            return undefined;
        }
        const matches = name.substring(0, index).match(OVERRIDE_PROPERTY_PATTERN);
        const overrideIdentifier = matches && matches[1];
        if (!overrideIdentifier || !this.preferenceSchemaService.overrideIdentifiers.has(overrideIdentifier)) {
            return undefined;
        }
        const preferenceName = name.substring(index + 1);
        return { preferenceName, overrideIdentifier };
    }

    computeOverridePatternPropertiesKey(): string | undefined {
        let param: string = '';
        for (const overrideIdentifier of this.preferenceSchemaService.overrideIdentifiers) {
            if (param.length) {
                param += '|';
            }
            param += new RegExp(escapeRegExpCharacters(overrideIdentifier)).source;
        }
        return param.length ? getOverridePattern(param) : undefined;
    }

    *getOverridePreferenceNames(preferenceName: string): IterableIterator<string> {
        for (const overrideIdentifier of this.preferenceSchemaService.overrideIdentifiers) {
            yield this.overridePreferenceName({ preferenceName, overrideIdentifier });
        }
    }
}
