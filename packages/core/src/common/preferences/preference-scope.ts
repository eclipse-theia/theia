// *****************************************************************************
// Copyright (C) 2019 Ericsson and others.
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

export enum PreferenceScope {
    Default,
    User,
    Workspace,
    Folder
}

export namespace PreferenceScope {
    export function is(scope: unknown): scope is PreferenceScope {
        return typeof scope === 'number' && getScopes().includes(scope);
    }

    /**
     * @returns preference scopes from broadest to narrowest: Default -> Folder.
     */
    export function getScopes(): PreferenceScope[] {
        return Object.values(PreferenceScope).filter(nameOrIndex => !isNaN(Number(nameOrIndex))) as PreferenceScope[];
    }

    /**
     * @returns preference scopes from narrowest to broadest. Folder -> Default.
     */
    export function getReversedScopes(): PreferenceScope[] {
        return getScopes().reverse();
    }

    export function getScopeNames(scope?: PreferenceScope): string[] {
        const names: string[] = [];
        const scopes = getScopes();
        if (scope) {
            for (const scopeIndex of scopes) {
                if (scopeIndex <= scope) {
                    names.push(PreferenceScope[scopeIndex]);
                }
            }
        }
        return names;
    }

    export function fromString(strScope: string): PreferenceScope | undefined {
        switch (strScope) {
            case 'application':
                return PreferenceScope.User;
            case 'window':
                return PreferenceScope.Folder;
            case 'resource':
                return PreferenceScope.Folder;
            case 'language-overridable':
                return PreferenceScope.Folder;
        }
    }
}
