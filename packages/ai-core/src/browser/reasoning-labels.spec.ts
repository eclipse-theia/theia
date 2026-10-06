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
import { reasoningLevelDescription, reasoningLevelLabel } from './reasoning-labels';

describe('Reasoning selector wording', () => {
    it('labels max and distinguishes provider-specific off behavior from explicit no reasoning', () => {
        expect(reasoningLevelLabel('max')).to.equal('Max');
        expect(reasoningLevelDescription('off')).to.equal(
            'Omits explicit reasoning effort, allowing provider defaults or raw request settings to apply; on Ollama, disables thinking.');
        expect(reasoningLevelDescription('none')).to.equal('Explicitly requests no reasoning.');
        expect(reasoningLevelDescription('high')).to.equal(undefined);
    });
});
