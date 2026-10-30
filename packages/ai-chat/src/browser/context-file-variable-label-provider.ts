// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { AIVariableResolutionRequest } from '@theia/ai-core';
import { Path, URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { LabelProvider, LabelProviderContribution } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ChangeSetFileService } from './change-set-file-service';

@injectable()
export class ContextFileVariableLabelProvider implements LabelProviderContribution {

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(ChangeSetFileService)
    protected readonly changeSetFileService: ChangeSetFileService;

    canHandle(element: object): number {
        if (AIVariableResolutionRequest.is(element) && element.variable.name === 'file') {
            return 10;
        }
        return -1;
    }

    getIcon(element: object): string | undefined {
        const uri = this.getUri(element);
        return uri ? this.labelProvider.getIcon(uri) : undefined;
    }

    getName(element: object): string | undefined {
        const uri = this.getUri(element);
        return uri ? this.labelProvider.getName(uri) : undefined;
    }

    getLongName(element: object): string | undefined {
        const uri = this.getUri(element);
        return uri ? this.labelProvider.getLongName(uri) : undefined;
    }

    getDetails(element: object): string | undefined {
        const uri = this.getUri(element);
        return uri ? this.labelProvider.getDetails(uri) : undefined;
    }

    protected getUri(element: object): URI | undefined {
        if (!AIVariableResolutionRequest.is(element) || !element.arg) {
            return undefined;
        }

        const rawArg = element.arg.trim();
        if (!rawArg) {
            return undefined;
        }

        if (rawArg.includes('://')) {
            return new URI(rawArg);
        }

        const normalized = Path.normalizePathSeparator(rawArg);
        const path = new Path(normalized).normalize();
        const segments = path.toString().split('/').filter(segment => segment.length > 0);
        if (path.isAbsolute || Path.isDrive(segments[0] ?? '')) {
            return URI.fromFilePath(normalized);
        }

        const relativePath = segments.join('/');
        if (this.workspaceService) {
            const rootPrefixed = this.workspaceService.resolveRootPrefixedPath(relativePath);
            if (rootPrefixed) {
                return rootPrefixed;
            }

            const supraRelative = this.workspaceService.resolveSupraRelativePath(relativePath);
            if (supraRelative.length === 1) {
                return supraRelative[0];
            }

            const roots = this.workspaceService.tryGetRoots();
            if (roots && roots.length > 0) {
                return roots[0].resource.resolve(relativePath);
            }
        }

        return new URI(normalized);
    }

}
