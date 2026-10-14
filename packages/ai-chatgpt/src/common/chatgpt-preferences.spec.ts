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

import { expect } from 'chai';
import {
    CHATGPT_ENABLED_PREF, ChatGptPreferencesSchema, MODELS_PREF,
    SERVER_SIDE_COMPACTION_PREF, SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD_PREF
} from './chatgpt-preferences';

describe('ChatGptPreferencesSchema', () => {
    it('marks every provider preference, including compaction preferences, as experimental', () => {
        const properties = ChatGptPreferencesSchema.properties;
        expect(Object.keys(properties)).to.include.members([
            CHATGPT_ENABLED_PREF, MODELS_PREF, SERVER_SIDE_COMPACTION_PREF, SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD_PREF
        ]);
        for (const [name, property] of Object.entries(properties)) {
            expect(property.tags, name).to.deep.equal(['experimental']);
        }
    });

    it('uses the model overrides preference key with an empty default', () => {
        expect(MODELS_PREF).to.equal('ai-features.chatGpt.modelOverrides');
        expect(ChatGptPreferencesSchema.properties[MODELS_PREF].default).to.deep.equal([]);
    });

    it('describes model overrides without authentication command links', () => {
        expect(ChatGptPreferencesSchema.properties[MODELS_PREF].markdownDescription).not.to.contain('command:');
    });
});
