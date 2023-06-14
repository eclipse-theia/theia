
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core/esm/vs/platform/theme/common/iconRegistry';
import { IconContribution, IconDefaults, IconFontDefinition, IconRegistry } from './monaco-icon-registry-types';
import { Event } from '@theia/core';
import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import { ThemeIcon } from '@theia/monaco-editor-core/esm/vs/platform/theme/common/themeService';

@injectable()
export class MonacoIconRegistry implements IconRegistry {
    protected readonly iconRegistry = monaco.getIconRegistry();

    onDidChange: Event<void> = this.iconRegistry.onDidChange;

    registerIcon(id: string, defaults: IconDefaults, description?: string | undefined): ThemeIcon {
        return this.iconRegistry.registerIcon(id, defaults, description);
    }
    deregisterIcon(id: string): void {
        return this.iconRegistry.deregisterIcon(id);
    }
    getIcons(): IconContribution[] {
        return this.iconRegistry.getIcons();
    }
    getIcon(id: string): IconContribution | undefined {
        return this.iconRegistry.getIcon(id);
    }
    getIconSchema(): IJSONSchema {
        return this.iconRegistry.getIconSchema();
    }
    getIconReferenceSchema(): IJSONSchema {
        return this.iconRegistry.getIconReferenceSchema();
    }
    registerIconFont(id: string, definition: IconFontDefinition): IconFontDefinition {
        return this.iconRegistry.registerIconFont(id, definition);
    }
    deregisterIconFont(id: string): void {
        return this.iconRegistry.deregisterIconFont(id);
    }
    getIconFont(id: string): IconFontDefinition | undefined {
        return this.iconRegistry.getIconFont(id);
    }

}
