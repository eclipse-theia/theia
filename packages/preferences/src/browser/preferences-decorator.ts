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

import { inject, injectable } from 'inversify';
import { Tree, TreeDecorator, TreeDecoration, PreferenceProperty, PreferenceService } from '@theia/core/lib/browser';
import { Emitter, Event, MaybePromise } from '@theia/core';

@injectable()
export class PreferencesDecorator implements TreeDecorator {
    readonly id: string = 'theia-preferences-decorator';

    protected preferences: { [id: string]: PreferenceProperty }[];
    protected preferencesDecorations: Map<string, TreeDecoration.Data>;

    protected readonly emitter: Emitter<(tree: Tree) => Map<string, TreeDecoration.Data>> = new Emitter();

    constructor(@inject(PreferenceService) private readonly preferencesService: PreferenceService) {
        this.preferencesDecorations = new Map();
        this.preferencesService.onPreferenceChanged(() => {
            this.fireDidChangeDecorations(this.preferences);
        });
    }

    get onDidChangeDecorations(): Event<(tree: Tree) => Map<string, TreeDecoration.Data>> {
        return this.emitter.event;
    }

    fireDidChangeDecorations(preferences: {[id: string]: PreferenceProperty}[]): void {
        if (!this.preferences) {
            this.preferences = preferences;
        }
        this.preferencesDecorations = new Map(preferences.map(m => {
            const preferenceName = Object.keys(m)[0];
            const preferenceValue = m[preferenceName];
            const storedValue = this.preferencesService.get(preferenceName);
            return [preferenceName, {
                tooltip: preferenceValue.description,
                captionSuffixes: [
                    {
                        data: storedValue || preferenceValue.default ? ': ' + (storedValue || preferenceValue.default) : undefined,
                    },
                    {
                        data: ' ' + preferenceValue.description,
                        fontData: {color: 'var(--theia-ui-font-color2)'}
                    }],
                fontData: this.preferencesService.get(preferenceName) ? {style: 'bold'} : undefined
            }] as [string, TreeDecoration.Data];
        }));
        this.emitter.fire(() => this.preferencesDecorations);
    }

    decorations(tree: Tree): MaybePromise<Map<string, TreeDecoration.Data>> {
        return this.preferencesDecorations;
    }
}
