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
import yargs from '@theia/core/shared/yargs';
import { Container } from '@theia/core/shared/inversify';
import { LaunchArguments } from '@theia/core/lib/common/launch-arguments';
import { LaunchArgvParser } from '@theia/core/lib/electron-main/launch-argv-parser';
import devContainerElectronMainModule from '../electron-main/dev-container-electron-main-module.js';
import { DevContainerClaimContribution } from '../electron-main/dev-container-claim-contribution.js';
import { DevContainerCliContribution } from './dev-container-cli-contribution.js';

function createArgs(overrides: Record<string, unknown> = {}): yargs.Arguments {
    return {
        _: [],
        '$0': '',
        ...overrides
    } as unknown as yargs.Arguments;
}

describe('DevContainerCliContribution', () => {

    it('claims the same container and resolves dev-json the same way as the cold-start CLI', () => {
        const container = new Container();
        container.load(devContainerElectronMainModule);
        const claim = container.get(DevContainerClaimContribution);
        const booleanOptions = container.getAll<string>(LaunchArgvParser.BooleanOption);

        for (const argv of [
            ['--attachContainer=X', '--devJson=false', 'my workspace'],
            ['--attach-container', '0x10', '--no-dev-json', 'my workspace'],
            ['--attach-container=false', '--dev-json', 'my workspace'],
            ['--attachContainer=X', '--no-dev-json', '--devJson', 'my workspace']
        ]) {
            const backend = new DevContainerCliContribution();
            const cli = yargs(argv);
            backend.configure(cli);
            backend.setArguments(cli.parseSync());

            LaunchArgvParser.command(argv, process.cwd(), booleanOptions)
                .command('$0 [file]', false, cmd => cmd.positional('file', { type: 'string' }), ({ file, ...options }) => {
                    const forwarded = LaunchArgvParser.fromParsed(options);
                    expect(file).to.equal('my workspace');
                    expect(claim.claimsWindow(forwarded)).to.be.true;
                    expect(LaunchArguments.lastValue(forwarded, 'attach-container')).to.equal(backend.getAttachContainerId());
                    expect(!LaunchArguments.isNegated(forwarded, 'dev-json')).to.equal(backend.shouldScanForDevJson());
                }).parseSync();
        }
    });

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
