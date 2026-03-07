// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import 'reflect-metadata';

import { expect } from 'chai';
import { LaunchListProvider, LaunchRunnerProvider, LaunchStopProvider } from './workspace-launch-provider';
import { DebugConfigurationManager } from '@theia/debug/lib/browser/debug-configuration-manager';
import { DebugSessionManager } from '@theia/debug/lib/browser/debug-session-manager';

disableJSDOM();

describe('Launch Configuration Providers - Group Field', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    describe('LaunchListProvider', () => {
        let provider: LaunchListProvider;

        beforeEach(() => {
            provider = new LaunchListProvider();
            // Mock dependencies
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (provider as any).debugConfigurationManager = {} as DebugConfigurationManager;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (provider as any).debugSessionManager = {} as DebugSessionManager;
        });

        it('should return ToolRequest with group field set to "Launch Configurations"', () => {
            const tool = provider.getTool();

            expect(tool).to.not.be.undefined;
            expect(tool.group).to.equal('Launch Configurations');
            expect(tool.id).to.equal('list_launch_configurations');
            expect(tool.name).to.equal('list_launch_configurations');
        });

        it('should have all required ToolRequest properties', () => {
            const tool = provider.getTool();

            expect(tool.id).to.be.a('string');
            expect(tool.name).to.be.a('string');
            expect(tool.description).to.be.a('string');
            expect(tool.parameters).to.be.an('object');
            expect(tool.handler).to.be.a('function');
            expect(tool.group).to.equal('Launch Configurations');
        });
    });

    describe('LaunchRunnerProvider', () => {
        let provider: LaunchRunnerProvider;

        beforeEach(() => {
            provider = new LaunchRunnerProvider();
            // Mock dependencies
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (provider as any).debugConfigurationManager = {} as DebugConfigurationManager;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (provider as any).debugSessionManager = {} as DebugSessionManager;
        });

        it('should return ToolRequest with group field set to "Launch Configurations"', () => {
            const tool = provider.getTool();

            expect(tool).to.not.be.undefined;
            expect(tool.group).to.equal('Launch Configurations');
            expect(tool.id).to.equal('run_launch_configuration');
            expect(tool.name).to.equal('run_launch_configuration');
        });

        it('should have all required ToolRequest properties', () => {
            const tool = provider.getTool();

            expect(tool.id).to.be.a('string');
            expect(tool.name).to.be.a('string');
            expect(tool.description).to.be.a('string');
            expect(tool.parameters).to.be.an('object');
            expect(tool.handler).to.be.a('function');
            expect(tool.group).to.equal('Launch Configurations');
        });
    });

    describe('LaunchStopProvider', () => {
        let provider: LaunchStopProvider;

        beforeEach(() => {
            provider = new LaunchStopProvider();
            // Mock dependencies
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (provider as any).debugSessionManager = {} as DebugSessionManager;
        });

        it('should return ToolRequest with group field set to "Launch Configurations"', () => {
            const tool = provider.getTool();

            expect(tool).to.not.be.undefined;
            expect(tool.group).to.equal('Launch Configurations');
            expect(tool.id).to.equal('stop_launch_configuration');
            expect(tool.name).to.equal('stop_launch_configuration');
        });

        it('should have all required ToolRequest properties', () => {
            const tool = provider.getTool();

            expect(tool.id).to.be.a('string');
            expect(tool.name).to.be.a('string');
            expect(tool.description).to.be.a('string');
            expect(tool.parameters).to.be.an('object');
            expect(tool.handler).to.be.a('function');
            expect(tool.group).to.equal('Launch Configurations');
        });
    });

    describe('Launch Configuration Providers - Group Consistency', () => {
        it('should have all three providers return the same group name', () => {
            const listProvider = new LaunchListProvider();
            const runnerProvider = new LaunchRunnerProvider();
            const stopProvider = new LaunchStopProvider();

            // Mock dependencies
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (listProvider as any).debugConfigurationManager = {} as DebugConfigurationManager;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (listProvider as any).debugSessionManager = {} as DebugSessionManager;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (runnerProvider as any).debugConfigurationManager = {} as DebugConfigurationManager;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (runnerProvider as any).debugSessionManager = {} as DebugSessionManager;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (stopProvider as any).debugSessionManager = {} as DebugSessionManager;

            const listTool = listProvider.getTool();
            const runnerTool = runnerProvider.getTool();
            const stopTool = stopProvider.getTool();

            expect(listTool.group).to.equal('Launch Configurations');
            expect(runnerTool.group).to.equal('Launch Configurations');
            expect(stopTool.group).to.equal('Launch Configurations');

            // All should have the same group value
            expect(listTool.group).to.equal(runnerTool.group);
            expect(runnerTool.group).to.equal(stopTool.group);
        });
    });
});
