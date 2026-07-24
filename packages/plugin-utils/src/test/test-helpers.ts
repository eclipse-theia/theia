// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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

import type { NormalizeContributionsContext } from '../contribution-types';
import type { PluginManifest } from '../manifest-types';
import { toPluginUrl } from '../plugin-model';

export function manifest(partial: Partial<PluginManifest> & Pick<PluginManifest, 'name'>): PluginManifest {
    return {
        version: '1.0.0',
        publisher: 'acme',
        packagePath: '/tmp/plugin',
        displayName: 'Test Extension',
        ...partial
    };
}

export function createNormalizeCtx(
    pluginOverrides?: Partial<PluginManifest>,
    ctxOverrides?: Partial<NormalizeContributionsContext>
): NormalizeContributionsContext {
    const plugin = manifest({ name: 'test-ext', ...pluginOverrides });
    return {
        plugin,
        resolveUrl: relativePath => toPluginUrl(plugin, relativePath),
        resolveUri: (pck, relativePath) => toPluginUrl(pck, relativePath),
        onError: () => undefined,
        onWarn: () => undefined,
        ...ctxOverrides
    };
}
