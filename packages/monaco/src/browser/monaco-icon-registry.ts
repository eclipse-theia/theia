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

import { Event } from '@theia/core';
import { ThemeIcon } from '@theia/monaco-editor-core/esm/vs/platform/theme/common/themeService';
import { IconRegistry } from '@theia/core/lib/browser/icon-registry';
import { IconDefinition, IconFontDefinition, getIconRegistry } from '@theia/monaco-editor-core/esm/vs/platform/theme/common/iconRegistry';

export class MonacoIconRegistry extends IconRegistry {

    override readonly onDidChange: Event<void>;
    protected readonly monacoIconService = getIconRegistry();

    /**
     * Register a icon to the registry.
     * @param id The icon id
     * @param defaults The default values
     * @param description The description
     */
    registerIcon(id: string, defaults: ThemeIcon | IconDefinition, description?: string): ThemeIcon {
        return this.monacoIconService.registerIcon(id, defaults, description);
    }

    /**
     * Deregister a icon from the registry.
     * @param id The icon id
     */
    deregisterIcon(id: string): void {
        return this.monacoIconService.deregisterIcon(id);
    }

    /**
     * Register a icon font to the registry.
     * @param id The icon font id
     * @param definition The icon font definition
     */
    registerIconFont(id: string, definition: IconFontDefinition): IconFontDefinition {
        return this.monacoIconService.registerIconFont(id, definition);
    }

    /**
     * Deregister an icon font from the registry.
     * @param id The icon font id
     */
    deregisterIconFont(id: string): void {
        return this.monacoIconService.deregisterIconFont(id);
    }

    /**
     * Get the icon font for the given id
     * @param id The icon font id
     */
    getIconFont(id: string): IconFontDefinition | undefined {
        return this.monacoIconService.getIconFont(id);
    }
}

