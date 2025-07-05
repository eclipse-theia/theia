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

import { CancellationTokenSource } from '@theia/core';
import { expect } from 'chai';

// Simple test for cancellation handling
describe('Tool Provider Cancellation Tests', () => {
    it('should verify basic cancellation token functionality', () => {
        // Create a cancellation token source
        const cts = new CancellationTokenSource();

        // Initially the token should not be cancelled
        expect(cts.token.isCancellationRequested).to.be.false;

        // After cancellation, the token should report as cancelled
        cts.cancel();
        expect(cts.token.isCancellationRequested).to.be.true;

        // Cleanup
        cts.dispose();
    });

    it('should trigger cancellation callback when cancelled', async () => {
        // Create a cancellation token source
        const cts = new CancellationTokenSource();

        // Create a flag to track if the callback was called
        let callbackCalled = false;

        // Register a cancellation callback
        const disposable = cts.token.onCancellationRequested(() => {
            callbackCalled = true;
        });

        // Initially the callback should not have been called
        expect(callbackCalled).to.be.false;

        // After cancellation, the callback should be called
        cts.cancel();
        expect(callbackCalled).to.be.true;

        // Cleanup
        disposable.dispose();
        cts.dispose();
    });
});
