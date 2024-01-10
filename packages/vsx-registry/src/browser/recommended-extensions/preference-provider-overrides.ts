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

import {
    FolderPreferenceProvider,
    FolderPreferenceProviderFactory,
    FolderPreferenceProviderFolder,
    UserPreferenceProvider,
    UserPreferenceProviderFactory
} from '@theia/preferences/lib/browser';
import { Container, injectable, interfaces } from '@theia/core/shared/inversify';
import { extensionsConfigurationSchema } from './recommended-extensions-json-schema';
import {
    WorkspaceFilePreferenceProvider,
    WorkspaceFilePreferenceProviderFactory,
    WorkspaceFilePreferenceProviderOptions
} from '@theia/preferences/lib/browser/workspace-file-preference-provider';
import { bindFactory } from '@theia/preferences/lib/browser/preference-bindings';
import { SectionPreferenceProviderSection, SectionPreferenceProviderUri } from '@theia/preferences/lib/browser/section-preference-provider';

/**
 * The overrides in this file are required because the base preference providers assume that a
 * section name (extensions) will not be used as a prefix (extensions.ignoreRecommendations).
 */

@injectable()
export class FolderPreferenceProviderWithExtensions extends FolderPreferenceProvider {
    protected override getPath(preferenceName: string): string[] | undefined {
        const path = super.getPath(preferenceName);
        if (this.section !== 'extensions' || !path?.length) {
            return path;
        }
        const isExtensionsField = path[0] in extensionsConfigurationSchema.properties!;
        if (isExtensionsField) {
            return path;
        }
        return undefined;
    }
}

@injectable()
export class UserPreferenceProviderWithExtensions extends UserPreferenceProvider {
    protected override getPath(preferenceName: string): string[] | undefined {
        const path = super.getPath(preferenceName);
        if (this.section !== 'extensions' || !path?.length) {
            return path;
        }
        const isExtensionsField = path[0] in extensionsConfigurationSchema.properties!;
        if (isExtensionsField) {
            return path;
        }
        return undefined;
    }
}

@injectable()
export class WorkspaceFilePreferenceProviderWithExtensions extends WorkspaceFilePreferenceProvider {
    protected override belongsInSection(firstSegment: string, remainder: string): boolean {
        if (firstSegment === 'extensions') {
            return remainder in extensionsConfigurationSchema.properties!;
        }
        return this.configurations.isSectionName(firstSegment);
    }
}

export function bindPreferenceProviderOverrides(bind: interfaces.Bind, unbind: interfaces.Unbind): void {
    unbind(UserPreferenceProviderFactory);
    unbind(FolderPreferenceProviderFactory);
    unbind(WorkspaceFilePreferenceProviderFactory);
    bindFactory(bind, UserPreferenceProviderFactory, UserPreferenceProviderWithExtensions, SectionPreferenceProviderUri, SectionPreferenceProviderSection);
    bindFactory(
        bind,
        FolderPreferenceProviderFactory,
        FolderPreferenceProviderWithExtensions,
        SectionPreferenceProviderUri,
        SectionPreferenceProviderSection,
        FolderPreferenceProviderFolder,
    );
    bind(WorkspaceFilePreferenceProviderFactory).toFactory(ctx => (options: WorkspaceFilePreferenceProviderOptions) => {
        const child = new Container({ defaultScope: 'Singleton' });
        child.parent = ctx.container;
        child.bind(WorkspaceFilePreferenceProvider).to(WorkspaceFilePreferenceProviderWithExtensions);
        child.bind(WorkspaceFilePreferenceProviderOptions).toConstantValue(options);
        return child.get(WorkspaceFilePreferenceProvider);
    });
}
