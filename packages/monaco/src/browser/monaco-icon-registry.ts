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

import { injectable } from '@theia/core/shared/inversify';
import { ThemeIcon } from '@theia/monaco-editor-core/esm/vs/platform/theme/common/themeService';
import { IconRegistry } from '@theia/core/lib/browser/icon-registry';
import { IconDefinition, IconFontDefinition, getIconRegistry } from '@theia/monaco-editor-core/esm/vs/platform/theme/common/iconRegistry';

@injectable()
export class MonacoIconRegistry implements IconRegistry {

    protected readonly iconRegistry = getIconRegistry();

    registerIcon(id: string, defaults: ThemeIcon | IconDefinition, description?: string): ThemeIcon {
        return this.iconRegistry.registerIcon(id, defaults, description);
    }

    deregisterIcon(id: string): void {
        return this.iconRegistry.deregisterIcon(id);
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

