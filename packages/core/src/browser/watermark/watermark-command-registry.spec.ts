// *****************************************************************************
// Copyright (C) 2022 Alexander Flammer.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as chai from 'chai';
import { WatermarkCommandRegistry } from './watermark-command-registry';

const expect = chai.expect;
let commandRegistry: WatermarkCommandRegistry;
const dummyCommandId = 'someCommand';

describe('WatermarkCommand Registration', () => {

    beforeEach(() => {
        commandRegistry = new WatermarkCommandRegistry();
    });

    it('should register a command id', async () => {
        commandRegistry.registerWatermarkCommand(dummyCommandId);
        const result = commandRegistry.getAllEnabledWatermarkCommands();
        expect(result).to.have.key(dummyCommandId);
    });

    it('should not add duplicate command ids', async () => {
        commandRegistry.registerWatermarkCommand(dummyCommandId);
        commandRegistry.registerWatermarkCommand(dummyCommandId);
        const result = commandRegistry.getAllEnabledWatermarkCommands();
        expect(result).to.have.key(dummyCommandId);
    });

    it('should remove registrations upon disposal', async () => {
        const registration = commandRegistry.registerWatermarkCommand(dummyCommandId);
        const result = commandRegistry.getAllEnabledWatermarkCommands();
        expect(result).to.have.key(dummyCommandId);
        registration.dispose();
        const commandsAfterDisposal = commandRegistry.getAllEnabledWatermarkCommands();
        // eslint-disable-next-line no-unused-expressions
        expect(commandsAfterDisposal).to.be.empty;
    });

    it('should return only enabled commands', async () => {
        const notVisibleCommandId = 'someNotVisibleCommandId';
        commandRegistry.registerWatermarkCommand(dummyCommandId, { isVisible: () => true });
        commandRegistry.registerWatermarkCommand(notVisibleCommandId, { isVisible: () => false });
        const result = commandRegistry.getAllEnabledWatermarkCommands();
        expect(result).to.have.key(dummyCommandId);
        expect(result).to.not.have.key(notVisibleCommandId);
    });

});
