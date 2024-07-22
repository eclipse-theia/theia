// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { inject, postConstruct } from '@theia/core/shared/inversify';
import { PromptServiceImpl } from '../common/prompt-service';
import { PromptPreferences } from './prompt-preferences';

export class FrontendPromptServiceImpl extends PromptServiceImpl {
    @inject(PromptPreferences) protected readonly preferences: PromptPreferences;

    @postConstruct()
    override init(): void {
        this.preferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'prompts') {
                Object.entries(e.newValue).forEach(entry => {
                    this._prompts[entry[0]] = { id: entry[0], template: entry[1] };
                });
            }
        });
    }
}
