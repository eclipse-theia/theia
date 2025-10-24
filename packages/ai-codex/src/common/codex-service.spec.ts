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

import { expect } from 'chai';
import {
    AgentMessageItem,
    CommandExecutionItem,
    ItemCompletedEvent,
    TurnCompletedEvent,
    TurnFailedEvent
} from './codex-service';

describe('Codex Service Types', () => {
    describe('ItemCompletedEvent', () => {
        it('should identify valid ItemCompletedEvent with CommandExecutionItem', () => {
            const event = {
                type: 'item.completed',
                item: {
                    type: 'command_execution',
                    command: 'npm test',
                    exit_code: 0,
                    aggregated_output: 'All tests passed'
                }
            };

            expect(ItemCompletedEvent.is(event)).to.be.true;
        });

        it('should identify valid ItemCompletedEvent with AgentMessageItem', () => {
            const event = {
                type: 'item.completed',
                item: {
                    type: 'agent_message',
                    text: 'Hello, I am an agent'
                }
            };

            expect(ItemCompletedEvent.is(event)).to.be.true;
        });

        it('should reject event with wrong type', () => {
            const event = {
                type: 'turn.completed',
                usage: { input_tokens: 100, output_tokens: 50 }
            };

            expect(ItemCompletedEvent.is(event)).to.be.false;
        });

        it('should reject event without type property', () => {
            const event = {
                item: {
                    type: 'command_execution',
                    command: 'test'
                }
            };

            expect(ItemCompletedEvent.is(event)).to.be.false;
        });

        it('should reject null', () => {
            expect(ItemCompletedEvent.is(null)).to.be.false;
        });

        it('should reject undefined', () => {
            expect(ItemCompletedEvent.is(undefined)).to.be.false;
        });

        it('should reject non-object types', () => {
            expect(ItemCompletedEvent.is('item.completed')).to.be.false;
            expect(ItemCompletedEvent.is(42)).to.be.false;
            expect(ItemCompletedEvent.is(true)).to.be.false;
        });
    });

    describe('CommandExecutionItem', () => {
        it('should identify valid CommandExecutionItem', () => {
            const item = {
                type: 'command_execution',
                command: 'ls -la',
                exit_code: 0,
                aggregated_output: 'file1.txt\nfile2.txt'
            };

            expect(CommandExecutionItem.is(item)).to.be.true;
        });

        it('should identify CommandExecutionItem with non-zero exit code', () => {
            const item = {
                type: 'command_execution',
                command: 'npm test',
                exit_code: 1,
                aggregated_output: 'Error: Test failed'
            };

            expect(CommandExecutionItem.is(item)).to.be.true;
        });

        it('should accept item even without command field', () => {
            const item = {
                type: 'command_execution',
                exit_code: 0,
                aggregated_output: 'output'
            };

            expect(CommandExecutionItem.is(item)).to.be.true;
        });

        it('should accept item even without exit_code field', () => {
            const item = {
                type: 'command_execution',
                command: 'ls',
                aggregated_output: 'output'
            };

            expect(CommandExecutionItem.is(item)).to.be.true;
        });

        it('should accept item even without aggregated_output field', () => {
            const item = {
                type: 'command_execution',
                command: 'ls',
                exit_code: 0
            };

            expect(CommandExecutionItem.is(item)).to.be.true;
        });

        it('should reject item with wrong type', () => {
            const item = {
                type: 'agent_message',
                text: 'Hello'
            };

            expect(CommandExecutionItem.is(item)).to.be.false;
        });

        it('should reject null', () => {
            expect(CommandExecutionItem.is(null)).to.be.false;
        });

        it('should reject undefined', () => {
            expect(CommandExecutionItem.is(undefined)).to.be.false;
        });

        it('should reject non-object types', () => {
            expect(CommandExecutionItem.is('command_execution')).to.be.false;
            expect(CommandExecutionItem.is(42)).to.be.false;
            expect(CommandExecutionItem.is([])).to.be.false;
        });
    });

    describe('AgentMessageItem', () => {
        it('should identify valid AgentMessageItem', () => {
            const item = {
                type: 'agent_message',
                text: 'Hello, how can I help you?'
            };

            expect(AgentMessageItem.is(item)).to.be.true;
        });

        it('should identify AgentMessageItem with empty text', () => {
            const item = {
                type: 'agent_message',
                text: ''
            };

            expect(AgentMessageItem.is(item)).to.be.true;
        });

        it('should accept item even without text field', () => {
            const item = {
                type: 'agent_message'
            };

            expect(AgentMessageItem.is(item)).to.be.true;
        });

        it('should reject item with wrong type', () => {
            const item = {
                type: 'command_execution',
                text: 'This is not an agent message'
            };

            expect(AgentMessageItem.is(item)).to.be.false;
        });

        it('should reject null', () => {
            expect(AgentMessageItem.is(null)).to.be.false;
        });

        it('should reject undefined', () => {
            expect(AgentMessageItem.is(undefined)).to.be.false;
        });

        it('should reject non-object types', () => {
            expect(AgentMessageItem.is('agent_message')).to.be.false;
            expect(AgentMessageItem.is(123)).to.be.false;
            expect(AgentMessageItem.is(false)).to.be.false;
        });
    });

    describe('TurnCompletedEvent', () => {
        it('should identify valid TurnCompletedEvent', () => {
            const event = {
                type: 'turn.completed',
                usage: {
                    input_tokens: 1000,
                    output_tokens: 500
                }
            };

            expect(TurnCompletedEvent.is(event)).to.be.true;
        });

        it('should identify TurnCompletedEvent with cached tokens', () => {
            const event = {
                type: 'turn.completed',
                usage: {
                    input_tokens: 1000,
                    output_tokens: 500,
                    cached_input_tokens: 200
                }
            };

            expect(TurnCompletedEvent.is(event)).to.be.true;
        });

        it('should reject event with wrong type', () => {
            const event = {
                type: 'item.completed',
                usage: {
                    input_tokens: 100,
                    output_tokens: 50
                }
            };

            expect(TurnCompletedEvent.is(event)).to.be.false;
        });

        it('should accept event even without usage field', () => {
            const event = {
                type: 'turn.completed'
            };

            expect(TurnCompletedEvent.is(event)).to.be.true;
        });

        it('should reject null', () => {
            expect(TurnCompletedEvent.is(null)).to.be.false;
        });

        it('should reject undefined', () => {
            expect(TurnCompletedEvent.is(undefined)).to.be.false;
        });

        it('should reject non-object types', () => {
            expect(TurnCompletedEvent.is('turn.completed')).to.be.false;
            expect(TurnCompletedEvent.is(42)).to.be.false;
        });
    });

    describe('TurnFailedEvent', () => {
        it('should identify valid TurnFailedEvent', () => {
            const event = {
                type: 'turn.failed',
                error: {
                    message: 'API request failed',
                    code: 'ECONNREFUSED'
                }
            };

            expect(TurnFailedEvent.is(event)).to.be.true;
        });

        it('should identify TurnFailedEvent without error code', () => {
            const event = {
                type: 'turn.failed',
                error: {
                    message: 'Unknown error occurred'
                }
            };

            expect(TurnFailedEvent.is(event)).to.be.true;
        });

        it('should reject event with wrong type', () => {
            const event = {
                type: 'turn.completed',
                error: {
                    message: 'This is not a failed event'
                }
            };

            expect(TurnFailedEvent.is(event)).to.be.false;
        });

        it('should accept event even without error field', () => {
            const event = {
                type: 'turn.failed'
            };

            expect(TurnFailedEvent.is(event)).to.be.true;
        });

        it('should reject null', () => {
            expect(TurnFailedEvent.is(null)).to.be.false;
        });

        it('should reject undefined', () => {
            expect(TurnFailedEvent.is(undefined)).to.be.false;
        });

        it('should reject non-object types', () => {
            expect(TurnFailedEvent.is('turn.failed')).to.be.false;
            expect(TurnFailedEvent.is(0)).to.be.false;
        });
    });
});
