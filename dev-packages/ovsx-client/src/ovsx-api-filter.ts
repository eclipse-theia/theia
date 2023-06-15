// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import * as semver from 'semver';
import { VSXAllVersions, VSXBuiltinNamespaces, VSXExtensionRaw, VSXSearchEntry } from './ovsx-types';

export const OVSXApiFilter = Symbol('OVSXApiFilter');
/**
 * Filter various data types based on a pre-defined supported VS Code API version.
 */
export interface OVSXApiFilter {
    supportedApiVersion: string;
    /**
     * Get the latest compatible extension version:
     * - A builtin extension is fetched based on the extension version which matches the API.
     * - An extension satisfies compatibility if its `engines.vscode` version is supported.
     *
     * @param extensionId the extension id.
     * @returns the data for the latest compatible extension version if available, else `undefined`.
     */
    getLatestCompatibleExtension(extensions: VSXExtensionRaw[]): VSXExtensionRaw | undefined;
    getLatestCompatibleVersion(searchEntry: VSXSearchEntry): VSXAllVersions | undefined;
}

export class OVSXApiFilterImpl implements OVSXApiFilter {

    constructor(
        public supportedApiVersion: string
    ) { }

    getLatestCompatibleExtension(extensions: VSXExtensionRaw[]): VSXExtensionRaw | undefined {
        if (extensions.length === 0) {
            return;
        } else if (this.isBuiltinNamespace(extensions[0].namespace.toLowerCase())) {
            return extensions.find(extension => this.versionGreaterThanOrEqualTo(extension.version, this.supportedApiVersion));
        } else {
            return extensions.find(extension => this.supportedVscodeApiSatisfies(extension.engines?.vscode ?? '*'));
        }
    }

    getLatestCompatibleVersion(searchEntry: VSXSearchEntry): VSXAllVersions | undefined {
        function getLatestCompatibleVersion(predicate: (allVersions: VSXAllVersions) => boolean): VSXAllVersions | undefined {
            if (searchEntry.allVersions) {
                return searchEntry.allVersions.find(predicate);
            }
            // If the allVersions field is missing then try to use the
            // searchEntry as VSXAllVersions and check if it's compatible:
            if (predicate(searchEntry)) {
                return searchEntry;
            }
        }
        if (this.isBuiltinNamespace(searchEntry.namespace)) {
            return getLatestCompatibleVersion(allVersions => this.versionGreaterThanOrEqualTo(allVersions.version, this.supportedApiVersion));
        } else {
            return getLatestCompatibleVersion(allVersions => this.supportedVscodeApiSatisfies(allVersions.engines?.vscode ?? '*'));
        }
    }

    protected isBuiltinNamespace(namespace: string): boolean {
        return VSXBuiltinNamespaces.is(namespace);
    }

    /**
     * @returns `a >= b`
     */
    protected versionGreaterThanOrEqualTo(a: string, b: string): boolean {
        const versionA = semver.clean(a);
        const versionB = semver.clean(b);
        if (!versionA || !versionB) {
            return false;
        }
        return semver.lte(versionA, versionB);
    }

    protected supportedVscodeApiSatisfies(vscodeApiRange: string): boolean {
        return semver.satisfies(this.supportedApiVersion, vscodeApiRange);
    }
}
