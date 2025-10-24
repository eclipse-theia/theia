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
import { CodexToolCallChatResponseContent } from './codex-tool-call-content';

describe('CodexToolCallChatResponseContent', () => {
    it('should create content with correct kind', () => {
        // Arrange & Act
        const content = new CodexToolCallChatResponseContent(
            'test-id',
            'command_execution',
            JSON.stringify({ command: 'npm test' }),
            true,
            JSON.stringify({ exit_code: 0 })
        );

        // Assert
        expect(content.kind).to.equal('toolCall');
    });

    it('should store tool ID correctly', () => {
        // Arrange & Act
        const content = new CodexToolCallChatResponseContent(
            'test-id',
            'command_execution',
            JSON.stringify({ command: 'npm test' }),
            false,
            undefined
        );

        // Assert
        expect(content.id).to.equal('test-id');
    });

    it('should store tool name correctly', () => {
        // Arrange & Act
        const content = new CodexToolCallChatResponseContent(
            'test-id',
            'command_execution',
            JSON.stringify({ command: 'npm test' }),
            false,
            undefined
        );

        // Assert
        expect(content.name).to.equal('command_execution');
    });

    it('should store arguments data', () => {
        // Arrange
        const args = JSON.stringify({ command: 'npm test' });

        // Act
        const content = new CodexToolCallChatResponseContent(
            'test-id',
            'command_execution',
            args,
            false,
            undefined
        );

        // Assert
        expect(content.arguments).to.equal(args);
    });

    it('should store result data', () => {
        // Arrange
        const result = JSON.stringify({ exit_code: 0, aggregated_output: 'Success' });

        // Act
        const content = new CodexToolCallChatResponseContent(
            'test-id',
            'command_execution',
            JSON.stringify({ command: 'npm test' }),
            true,
            result
        );

        // Assert
        expect(content.result).to.equal(result);
    });

    it('should store finished flag', () => {
        // Arrange & Act
        const content = new CodexToolCallChatResponseContent(
            'test-id',
            'command_execution',
            JSON.stringify({ command: 'npm test' }),
            true,
            JSON.stringify({ exit_code: 1 })
        );

        // Assert
        expect(content.finished).to.equal(true);
    });

    it('should handle undefined result', () => {
        // Arrange & Act
        const content = new CodexToolCallChatResponseContent(
            'test-id',
            'command_execution',
            JSON.stringify({ command: 'npm test' }),
            false,
            undefined
        );

        // Assert
        expect(content.result).to.be.undefined;
    });

    it('should handle undefined finished flag (defaults to false)', () => {
        // Arrange & Act
        const content = new CodexToolCallChatResponseContent(
            'test-id',
            'command_execution',
            JSON.stringify({ command: 'npm test' }),
            undefined,
            JSON.stringify({ exit_code: 0 })
        );

        // Assert
        expect(content.finished).to.equal(false);
    });

    it('should track in-progress tool calls', () => {
        // Arrange & Act - Create tool call that starts but hasn't finished
        const content = new CodexToolCallChatResponseContent(
            'test-id',
            'command_execution',
            JSON.stringify({ command: 'npm test' }),
            false,
            undefined
        );

        // Assert
        expect(content.id).to.equal('test-id');
        expect(content.name).to.equal('command_execution');
        expect(content.finished).to.equal(false);
        expect(content.result).to.be.undefined;
    });

    it('should track completed tool calls', () => {
        // Arrange & Act - Create tool call that has completed
        const content = new CodexToolCallChatResponseContent(
            'test-id',
            'command_execution',
            JSON.stringify({ command: 'npm test' }),
            true,
            JSON.stringify({ exit_code: 0, aggregated_output: 'Success' })
        );

        // Assert
        expect(content.id).to.equal('test-id');
        expect(content.name).to.equal('command_execution');
        expect(content.finished).to.equal(true);
        expect(content.result).to.not.be.undefined;
    });

    it('should be identifiable via static is method', () => {
        // Arrange
        const content = new CodexToolCallChatResponseContent(
            'test-id',
            'command_execution',
            JSON.stringify({ command: 'npm test' }),
            false,
            undefined
        );

        // Act & Assert
        expect(CodexToolCallChatResponseContent.is(content)).to.be.true;
        expect(CodexToolCallChatResponseContent.is({})).to.be.false;
        expect(CodexToolCallChatResponseContent.is(null)).to.be.false;
        expect(CodexToolCallChatResponseContent.is(undefined)).to.be.false;
    });
});
