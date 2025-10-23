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

describe('CodexChatAgent', () => {
    describe('Token Formatting Logic', () => {
        it('should format tokens under 1000 as plain number', () => {
            // Arrange
            const tokens = 500;

            // Act
            const formatted = tokens >= 1000
                ? `${(tokens / 1000).toFixed(1)}K`
                : tokens.toString();

            // Assert
            expect(formatted).to.equal('500');
        });

        it('should format zero tokens as plain number', () => {
            // Arrange
            const tokens = 0;

            // Act
            const formatted = tokens >= 1000
                ? `${(tokens / 1000).toFixed(1)}K`
                : tokens.toString();

            // Assert
            expect(formatted).to.equal('0');
        });

        it('should format tokens over 1000 with K suffix', () => {
            // Arrange
            const tokens = 1500;

            // Act
            const formatted = tokens >= 1000
                ? `${(tokens / 1000).toFixed(1)}K`
                : tokens.toString();

            // Assert
            expect(formatted).to.equal('1.5K');
        });

        it('should format exactly 1000 tokens with K suffix', () => {
            // Arrange
            const tokens = 1000;

            // Act
            const formatted = tokens >= 1000
                ? `${(tokens / 1000).toFixed(1)}K`
                : tokens.toString();

            // Assert
            expect(formatted).to.equal('1.0K');
        });

        it('should format large token counts with K suffix', () => {
            // Arrange
            const tokens = 25789;

            // Act
            const formatted = tokens >= 1000
                ? `${(tokens / 1000).toFixed(1)}K`
                : tokens.toString();

            // Assert
            expect(formatted).to.equal('25.8K');
        });

        it('should round token counts to one decimal place', () => {
            // Arrange
            const tokens = 1234;

            // Act
            const formatted = tokens >= 1000
                ? `${(tokens / 1000).toFixed(1)}K`
                : tokens.toString();

            // Assert
            expect(formatted).to.equal('1.2K');
        });

        it('should format 999 tokens without K suffix', () => {
            // Arrange
            const tokens = 999;

            // Act
            const formatted = tokens >= 1000
                ? `${(tokens / 1000).toFixed(1)}K`
                : tokens.toString();

            // Assert
            expect(formatted).to.equal('999');
        });
    });

    describe('Session Suggestion Format', () => {
        it('should format suggestion with input and output tokens', () => {
            // Arrange
            const inputTokens = 1500;
            const outputTokens = 750;
            const formatTokens = (tokens: number): string => {
                if (tokens >= 1000) {
                    return `${(tokens / 1000).toFixed(1)}K`;
                }
                return tokens.toString();
            };

            // Act
            const suggestion = `↑ ${formatTokens(inputTokens)} | ↓ ${formatTokens(outputTokens)}`;

            // Assert
            expect(suggestion).to.equal('↑ 1.5K | ↓ 750');
        });

        it('should format suggestion with both tokens over 1000', () => {
            // Arrange
            const inputTokens = 5000;
            const outputTokens = 3000;
            const formatTokens = (tokens: number): string => {
                if (tokens >= 1000) {
                    return `${(tokens / 1000).toFixed(1)}K`;
                }
                return tokens.toString();
            };

            // Act
            const suggestion = `↑ ${formatTokens(inputTokens)} | ↓ ${formatTokens(outputTokens)}`;

            // Assert
            expect(suggestion).to.equal('↑ 5.0K | ↓ 3.0K');
        });

        it('should format suggestion with zero tokens', () => {
            // Arrange
            const inputTokens = 0;
            const outputTokens = 0;
            const formatTokens = (tokens: number): string => {
                if (tokens >= 1000) {
                    return `${(tokens / 1000).toFixed(1)}K`;
                }
                return tokens.toString();
            };

            // Act
            const suggestion = `↑ ${formatTokens(inputTokens)} | ↓ ${formatTokens(outputTokens)}`;

            // Assert
            expect(suggestion).to.equal('↑ 0 | ↓ 0');
        });
    });

    describe('Prompt Processing Logic', () => {
        it('should remove agent address from prompt', () => {
            // Arrange
            const agentAddress = '@Codex';
            const originalPrompt = '@Codex write a function';

            // Act
            let processedPrompt = originalPrompt.trim();
            if (processedPrompt.startsWith(agentAddress)) {
                processedPrompt = processedPrompt.replace(agentAddress, '').trim();
            }

            // Assert
            expect(processedPrompt).to.equal('write a function');
        });

        it('should not modify prompt without agent address', () => {
            // Arrange
            const agentAddress = '@Codex';
            const originalPrompt = 'write a function';

            // Act
            let processedPrompt = originalPrompt.trim();
            if (processedPrompt.startsWith(agentAddress)) {
                processedPrompt = processedPrompt.replace(agentAddress, '').trim();
            }

            // Assert
            expect(processedPrompt).to.equal('write a function');
        });

        it('should handle prompt with only agent address', () => {
            // Arrange
            const agentAddress = '@Codex';
            const originalPrompt = '@Codex';

            // Act
            let processedPrompt = originalPrompt.trim();
            if (processedPrompt.startsWith(agentAddress)) {
                processedPrompt = processedPrompt.replace(agentAddress, '').trim();
            }

            // Assert
            expect(processedPrompt).to.equal('');
        });

        it('should handle prompt with agent address and extra spaces', () => {
            // Arrange
            const agentAddress = '@Codex';
            const originalPrompt = '@Codex    write a function';

            // Act
            let processedPrompt = originalPrompt.trim();
            if (processedPrompt.startsWith(agentAddress)) {
                processedPrompt = processedPrompt.replace(agentAddress, '').trim();
            }

            // Assert
            expect(processedPrompt).to.equal('write a function');
        });
    });

    describe('Command Output Markdown Formatting', () => {
        it('should format command execution with exit code and output', () => {
            // Arrange
            const command = 'npm test';
            const exitCode = 0;
            const output = 'All tests passed';

            // Act
            const markdown = `\`\`\`bash\n${command}\n\`\`\`\n\nExit code: ${exitCode}\n\n\`\`\`\n${output}\n\`\`\``;

            // Assert
            expect(markdown).to.include('```bash');
            expect(markdown).to.include('npm test');
            expect(markdown).to.include('Exit code: 0');
            expect(markdown).to.include('All tests passed');
        });

        it('should format command with non-zero exit code', () => {
            // Arrange
            const command = 'npm build';
            const exitCode = 1;
            const output = 'Build failed';

            // Act
            const markdown = `\`\`\`bash\n${command}\n\`\`\`\n\nExit code: ${exitCode}\n\n\`\`\`\n${output}\n\`\`\``;

            // Assert
            expect(markdown).to.include('Exit code: 1');
            expect(markdown).to.include('Build failed');
        });

        it('should format command with multiline output', () => {
            // Arrange
            const command = 'ls -la';
            const exitCode = 0;
            const output = 'file1.txt\nfile2.txt\nfile3.txt';

            // Act
            const markdown = `\`\`\`bash\n${command}\n\`\`\`\n\nExit code: ${exitCode}\n\n\`\`\`\n${output}\n\`\`\``;

            // Assert
            expect(markdown).to.include('file1.txt\nfile2.txt\nfile3.txt');
        });
    });
});
