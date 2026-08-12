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
import { PreferenceLayoutProvider } from './preference-layout';

describe('preference-layout', () => {

    const provider = new PreferenceLayoutProvider();

    it('assigns the ChatGPT preferences a section with the brand spelling', () => {
        const layout = provider.getLayoutForPreference('ai-features.chatGpt.models');
        expect(layout?.id).eq('ai-features.chatGpt');
        expect(layout?.label).eq('ChatGPT');
    });

    it('keeps the chat preferences in their own section despite the shared prefix', () => {
        expect(provider.getLayoutForPreference('ai-features.chat.defaultChatAgent')?.id).eq('ai-features.chat');
    });
});
