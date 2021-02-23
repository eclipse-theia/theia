/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Tree, TreeDecorator, TreeDecoration, PreferenceDataProperty, PreferenceService } from '@theia/core/lib/browser';
import { Emitter, Event, MaybePromise } from '@theia/core';
import { escapeInvisibleChars } from '@theia/core/lib/common/strings';

@injectable()
export class PreferencesDecorator implements TreeDecorator {
    readonly id: string = 'theia-preferences-decorator';

    protected activeFolderUri: string | undefined;
    protected preferences: { [id: string]: PreferenceDataProperty }[];
    protected preferencesDecorations: Map<string, TreeDecoration.Data> = new Map();
    protected readonly emitter: Emitter<(tree: Tree) => Map<string, TreeDecoration.Data>> = new Emitter();

    @inject(PreferenceService) protected readonly preferencesService: PreferenceService;

    @postConstruct()
    protected init(): void {
        this.preferencesService.onPreferenceChanged(() => {
            this.fireDidChangeDecorations(this.preferences);
        });
    }

    get onDidChangeDecorations(): Event<(tree: Tree) => Map<string, TreeDecoration.Data>> {
        return this.emitter.event;
    }

    fireDidChangeDecorations(preferences: { [id: string]: PreferenceDataProperty }[]): void {
        if (!this.preferences) {
            this.preferences = preferences;
        }
        if (preferences) {
            this.preferencesDecorations = new Map(preferences.map(m => {
                const preferenceName = Object.keys(m)[0];
                const preferenceValue = m[preferenceName];
                const storedValue = this.preferencesService.get(preferenceName, undefined, this.activeFolderUri);
                const description = this.getDescription(preferenceValue);
                return [preferenceName, {
                    tooltip: this.buildTooltip(preferenceValue),
                    captionSuffixes: [
                        {
                            data: `: ${this.getPreferenceDisplayValue(storedValue, preferenceValue.defaultValue)}`
                        },
                        {
                            data: ' ' + description,
                            fontData: { color: 'var(--theia-descriptionForeground)' }
                        }]
                }] as [string, TreeDecoration.Data];
            }));
        }
        this.emitter.fire(() => this.preferencesDecorations);
    }

    decorations(tree: Tree): MaybePromise<Map<string, TreeDecoration.Data>> {
        return this.preferencesDecorations;
    }

    protected setActiveFolder(folder: string): void {
        this.activeFolderUri = folder;
        this.fireDidChangeDecorations(this.preferences);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected getPreferenceDisplayValue(storedValue: any, defaultValue: any): any {
        if (storedValue !== undefined) {
            if (typeof storedValue === 'string') {
                return escapeInvisibleChars(storedValue);
            }
            return storedValue;
        }
        return defaultValue;
    }

    protected buildTooltip(data: PreferenceDataProperty): string {
        let tooltips: string = '';
        if (data.description) {
            tooltips = data.description;
        }
        if (data.defaultValue) {
            tooltips += `\nDefault: ${JSON.stringify(data.defaultValue)}`;
        } else if (data.default !== undefined) {
            tooltips += `\nDefault: ${JSON.stringify(data.default)}`;
        }
        if (data.minimum) {
            tooltips += `\nMin: ${data.minimum}`;
        }
        if (data.enum) {
            tooltips += `\nAccepted Values: ${data.enum.join(', ')}`;
        }
        return tooltips;
    }

    /**
     * Get the description for the preference for display purposes.
     * @param value {PreferenceDataProperty} the preference data property.
     * @returns the description if available.
     */
    protected getDescription(value: PreferenceDataProperty): string {

        /**
         * Format the string for consistency and display purposes.
         * Formatting includes:
         * - capitalizing the string.
         * - ensuring it ends in punctuation (`.`).
         * @param str {string} the string to format.
         * @returns the formatted string.
         */
        function format(str: string): string {
            if (str.endsWith('.')) {
                return str.charAt(0).toUpperCase() + str.slice(1);
            }
            return `${str.charAt(0).toUpperCase() + str.slice(1)}.`;
        }

        if (value.description) {
            return format(value.description);
        } else if (value.markdownDescription) {
            return format(value.markdownDescription);
        }
        return '';
    }
}
