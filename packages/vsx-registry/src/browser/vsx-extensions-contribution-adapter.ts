// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { Event, nls } from '@theia/core';
import { TreeElement } from '@theia/core/lib/browser/source-tree';
import { PluginIdentifiers } from '@theia/plugin-ext';
import { ExtensionsSourceContribution, SearchResult } from './extensions-source-contribution';
import { VSXExtension } from './vsx-extension';
import { VSXExtensionsModel } from './vsx-extensions-model';

/**
 * Adapter that exposes the VSX extensions model as a generic `ExtensionsSourceContribution`.
 *
 * The model continues to own all VSX-specific state (OVSX search, plugin server
 * lifecycle, recommendations). This adapter is a thin translation layer that lets
 * the Extensions view query VSX entries through the same contribution mechanism
 * as MCP servers and future artifact types.
 */
@injectable()
export class VSXExtensionsContributionAdapter implements ExtensionsSourceContribution {

    readonly type = 'extension';
    readonly displayName = nls.localizeByDefault('Extensions');
    readonly priority = 0;

    @inject(VSXExtensionsModel)
    protected readonly model: VSXExtensionsModel;

    get onDidChange(): Event<void> {
        return this.model.onDidChange;
    }

    *resolveInstalled(): Iterable<TreeElement> {
        yield* this.installedExtensions(false);
    }

    *resolveBuiltIn(): Iterable<TreeElement> {
        yield* this.installedExtensions(true);
    }

    *resolveRecommended(): Iterable<TreeElement> {
        for (const id of this.model.recommended) {
            if (this.model.isInstalled(id)) {
                continue;
            }
            const extension = this.model.getExtension(id);
            if (extension && !extension.builtin) {
                yield extension;
            }
        }
    }

    *resolveSearchResults(): Iterable<SearchResult> {
        // VSX's search results are driven by the search bar's query into the model
        // (the model subscribes to `VSXExtensionsSearchModel.onDidChangeQuery`). The
        // contribution interface's `query` argument is therefore not consumed here -
        // the model already maintains the result set in step with the query.
        for (const id of this.model.searchResult) {
            const extension = this.model.getExtension(id);
            if (extension && !extension.builtin) {
                yield { element: extension, searchableText: searchableTextFor(extension) };
            }
        }
    }

    protected *installedExtensions(builtIn: boolean): Iterable<VSXExtension> {
        for (const versioned of this.model.installed) {
            const id = PluginIdentifiers.toUnversioned(versioned as PluginIdentifiers.VersionedId);
            const extension = this.model.getExtension(id);
            if (!extension) {
                continue;
            }
            if (Boolean(extension.builtin) === builtIn) {
                yield extension;
            }
        }
    }
}

function searchableTextFor(extension: VSXExtension): string {
    // Concatenate the most distinctive user-visible fields so the global fuzzy
    // matcher considers the same things the user typically searches for.
    return [extension.displayName, extension.id, extension.publisher, extension.description]
        .filter((s): s is string => !!s)
        .join(' ');
}
