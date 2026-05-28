// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { DevContainerCliContribution } from './dev-container-cli-contribution';
import { Arguments } from '@theia/core/shared/yargs';

function createArgs(overrides: Record<string, unknown> = {}): Arguments {
    return {
        _: [],
        '$0': '',
        ...overrides
    } as unknown as Arguments;
}

describe('DevContainerCliContribution', () => {

    describe('setArguments / getAttachContainerId', () => {

        it('should return undefined when --attach-container not provided', () => {
            const contribution = new DevContainerCliContribution();
            contribution.setArguments(createArgs());
            expect(contribution.getAttachContainerId()).to.be.undefined;
        });

        it('should stash container ID from --attach-container', () => {
            const contribution = new DevContainerCliContribution();
            contribution.setArguments(createArgs({ 'attach-container': 'abc123' }));
            expect(contribution.getAttachContainerId()).to.equal('abc123');
        });

        it('should convert numeric container ID to string', () => {
            const contribution = new DevContainerCliContribution();
            contribution.setArguments(createArgs({ 'attach-container': 12345 }));
            expect(contribution.getAttachContainerId()).to.equal('12345');
        });

        it('should ignore empty string --attach-container', () => {
            const contribution = new DevContainerCliContribution();
            contribution.setArguments(createArgs({ 'attach-container': '' }));
            expect(contribution.getAttachContainerId()).to.be.undefined;
        });

        it('should ignore whitespace-only --attach-container', () => {
            const contribution = new DevContainerCliContribution();
            contribution.setArguments(createArgs({ 'attach-container': '  ' }));
            expect(contribution.getAttachContainerId()).to.be.undefined;
        });
    });

    describe('consumeAttachContainerId', () => {

        it('should return the container ID and clear it', () => {
            const contribution = new DevContainerCliContribution();
            contribution.setArguments(createArgs({ 'attach-container': 'abc123' }));
            expect(contribution.consumeAttachContainerId()).to.equal('abc123');
            expect(contribution.consumeAttachContainerId()).to.be.undefined;
            expect(contribution.getAttachContainerId()).to.be.undefined;
        });

        it('should return undefined when no ID was set', () => {
            const contribution = new DevContainerCliContribution();
            contribution.setArguments(createArgs());
            expect(contribution.consumeAttachContainerId()).to.be.undefined;
        });
    });

    describe('shouldScanForDevJson', () => {

        it('should default to true', () => {
            const contribution = new DevContainerCliContribution();
            expect(contribution.shouldScanForDevJson()).to.be.true;
        });

        it('should remain true when --dev-json is true', () => {
            const contribution = new DevContainerCliContribution();
            contribution.setArguments(createArgs({ 'dev-json': true }));
            expect(contribution.shouldScanForDevJson()).to.be.true;
        });

        it('should be false when --dev-json is false', () => {
            const contribution = new DevContainerCliContribution();
            contribution.setArguments(createArgs({ 'dev-json': false }));
            expect(contribution.shouldScanForDevJson()).to.be.false;
        });

        it('should be true when --dev-json is undefined', () => {
            const contribution = new DevContainerCliContribution();
            contribution.setArguments(createArgs({ 'dev-json': undefined }));
            expect(contribution.shouldScanForDevJson()).to.be.true;
        });
    });
});
