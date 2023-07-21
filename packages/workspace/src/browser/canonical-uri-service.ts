// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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

import { CancellationToken, URI } from '@theia/core/lib/common';
import { injectable } from '@theia/core/shared/inversify';
import { Disposable } from '@theia/core/shared/vscode-languageserver-protocol';

export interface CanonicalUriProvider extends Disposable {
    provideCanonicalUri(uri: URI, targetScheme: string, token: CancellationToken): Promise<URI | undefined>;
}

@injectable()
export class CanonicalUriService {
    private providers = new Map<string, CanonicalUriProvider>();

    registerCanonicalUriProvider(scheme: string, provider: CanonicalUriProvider): Disposable {
        if (this.providers.has(scheme)) {
            throw new Error(`Canonical URI provider for scheme: '${scheme}' already exists`);
        }

        this.providers.set(scheme, provider);
        return Disposable.create(() => { this.removeCanonicalUriProvider(scheme); });
    }

    private removeCanonicalUriProvider(scheme: string): void {
        const provider = this.providers.get(scheme);
        if (!provider) {
            throw new Error(`No Canonical URI provider for scheme: '${scheme}' exists`);
        }

        this.providers.delete(scheme);
        provider.dispose();
    }

    async provideCanonicalUri(uri: URI, targetScheme: string, token: CancellationToken = CancellationToken.None): Promise<URI | undefined> {
        const provider = this.providers.get(uri.scheme);
        if (!provider) {
            console.warn(`No Canonical URI provider for scheme: '${uri.scheme}' exists`);
            return undefined;
        }

        return provider.provideCanonicalUri(uri, targetScheme, token);
    }
}
