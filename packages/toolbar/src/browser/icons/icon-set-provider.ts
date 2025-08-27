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

import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { IconSet } from '../toolbar-interfaces';
import { fontAwesomeMapping } from './font-awesome-icons';
import { codiconsMapping } from './codicons';

/**
 * Provider for icon set information including:
 * - List of unique icon IDs to avoid duplicate icons due to different keywords
 * - Metadata about each icon (main keyword and all associated keywords)
 */
@injectable()
export class IconSetProvider {

    private readonly iconSetMappings = new Map<IconSet, Record<string, string | number>>();
    private readonly iconsBySet = new Map<IconSet, string[]>();
    private readonly infoMapBySet = new Map<IconSet, Map<string, { mainKeyword: string; allKeywords: string }>>();

    /**
     * Initializes all available icon sets
     */
    @postConstruct()
    protected init(): void {
        // Register built-in icon sets
        this.registerIconSet(IconSet.FA, fontAwesomeMapping);
        this.registerIconSet(IconSet.CODICON, codiconsMapping);
    }

    /**
     * Registers a new icon set with its mapping
     *
     * @param iconSet The icon set identifier
     * @param mapping The mapping object that maps icon names to their values
     */
    registerIconSet(iconSet: IconSet, mapping: Record<string, string | number>): void {
        // Store the mapping
        this.iconSetMappings.set(iconSet, mapping);

        // Initialize the icons array and infoMap for this set
        const icons: string[] = [];
        const infoMap = new Map<string, { mainKeyword: string; allKeywords: string }>();
        const iconValueToKeywords = new Map<string | number, string[]>();

        // Process all mappings to group keywords by their icon value
        Object.entries(mapping).forEach(([keyword, value]) => {
            if (!iconValueToKeywords.has(value)) {
                iconValueToKeywords.set(value, [keyword]);
            } else {
                iconValueToKeywords.get(value)?.push(keyword);
            }
        });

        // For each unique icon value, create an entry with the first keyword and store all keywords
        iconValueToKeywords.forEach((keywords, value) => {
            keywords.sort();
            const mainKeyword = keywords[0];
            const allKeywords = keywords.join(', ');

            const iconId = mainKeyword;
            icons.push(iconId);

            infoMap.set(iconId, {
                mainKeyword,
                allKeywords
            });
        });

        // Store the processed data for this icon set
        this.iconsBySet.set(iconSet, icons);
        this.infoMapBySet.set(iconSet, infoMap);
    }

    /**
     * Gets the list of all icon IDs for a specific icon set
     *
     * @param iconSet The icon set to get icons for
     * @returns Array of icon IDs in the specified set
     */
    getIcons(iconSet: IconSet): string[] {
        return this.iconsBySet.get(iconSet) || [];
    }

    /**
     * Returns the keywords associated with the given icon ID in a specific icon set
     *
     * @param iconSet The icon set to get keywords from
     * @param iconId The icon ID to get keywords for
     * @returns A comma-separated string of keywords
     */
    getKeywords(iconSet: IconSet, iconId: string): string {
        const infoMap = this.infoMapBySet.get(iconSet);
        if (infoMap) {
            const info = infoMap.get(iconId);
            if (info) {
                return info.allKeywords;
            }
        }
        return iconId;
    }

    /**
     * Returns the mapping for a specific icon set
     *
     * @param iconSet The icon set to get the mapping for
     * @returns The mapping object for the specified icon set
     */
    getMapping(iconSet: IconSet): Record<string, string | number> {
        return this.iconSetMappings.get(iconSet) || {};
    }

    /**
     * Checks if an icon set is registered
     *
     * @param iconSet The icon set to check
     * @returns True if the icon set is registered
     */
    hasIconSet(iconSet: IconSet): boolean {
        return this.iconSetMappings.has(iconSet);
    }
}
