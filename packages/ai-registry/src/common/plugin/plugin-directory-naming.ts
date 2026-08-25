// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

// Do not "fix" this to `filenamify/browser`: TypeScript's `moduleResolution: node` cannot read the
// package's `exports` map, and the sub-path that does type-resolve fails at runtime with
// ERR_PACKAGE_PATH_NOT_EXPORTED. The entry point pulls Node's `path` into the browser graph, which
// both bundlers already polyfill.
import * as filenamify from 'filenamify';
import { nls } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';

/** Rejects anything that is not a single path segment, including a Windows drive-absolute path. */
const NOT_A_SINGLE_SEGMENT = /[/\\]|^[A-Za-z]:/;

export const PluginDirectoryNaming = Symbol('PluginDirectoryNaming');
/**
 * Turns a plugin identifier into its directory name under the plugins root. Shared between backend
 * and frontend on purpose: two independent encodings would disagree on some identifier and produce
 * two directories for one plugin, which is what adoption exists to prevent.
 */
export interface PluginDirectoryNaming {
    /**
     * @throws Error when the identifier does not encode to a usable single path segment. The name
     * comes from registry JSON, so this is what stops a `..` escaping the plugins root.
     */
    directoryName(pluginId: string): string;
}

@injectable()
export class PluginDirectoryNamingImpl implements PluginDirectoryNaming {

    directoryName(pluginId: string): string {
        const encoded = filenamify(pluginId, { replacement: '_' });
        if (!encoded || encoded === '.' || encoded === '..' || NOT_A_SINGLE_SEGMENT.test(encoded)) {
            throw new Error(nls.localize('theia/ai-registry/plugin/invalidDirectoryName',
                'Invalid plugin directory name "{0}": it must be a single path segment without separators.', encoded));
        }
        return encoded;
    }
}
