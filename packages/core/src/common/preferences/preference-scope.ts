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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

// tslint:disable:no-any

export enum PreferenceScope {
    Default,
    User,
    Workspace,
    Folder
}

export namespace PreferenceScope {
    export function is(scope: any): scope is PreferenceScope {
        return typeof scope === 'number' && getScopes().findIndex(s => s === scope) >= 0;
    }

    export function getScopes(): PreferenceScope[] {
        return Object.keys(PreferenceScope)
            .filter(k => typeof PreferenceScope[k as any] === 'string')
            .map(v => <PreferenceScope>Number(v));
    }

    export function getReversedScopes(): PreferenceScope[] {
        return getScopes().reverse();
    }

    export function getScopeNames(scope?: PreferenceScope): string[] {
        const names: string[] = [];
        const allNames = Object.keys(PreferenceScope)
            .filter(k => typeof PreferenceScope[k as any] === 'number');
        if (scope) {
            for (const name of allNames) {
                if ((<any>PreferenceScope)[name] <= scope) {
                    names.push(name);
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
        }
    }
}
