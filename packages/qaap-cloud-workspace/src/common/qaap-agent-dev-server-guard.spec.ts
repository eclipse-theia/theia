// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { findQaiqDevServerGuardDenial, isLongLivedDevServerShellCommand } from './qaap-agent-dev-server-guard';

describe('qaap-agent-dev-server-guard', () => {

    it('blocks long-lived dev server commands, including background variants', () => {
        const blocked = [
            'pnpm dev',
            'npm run dev',
            'npm start',
            'yarn serve',
            'bun run preview',
            'nohup pnpm dev > /tmp/vite.log 2>&1 &',
            'cd packages/app && pnpm dev',
            'npx vite',
            'npx next dev -p 3001',
            'vite --port 5175',
            'pnpm install && pnpm dev',
        ];
        for (const command of blocked) {
            expect(isLongLivedDevServerShellCommand(command), command).to.equal(true);
        }
    });

    it('allows one-shot commands that merely look like dev tooling', () => {
        const allowed = [
            'pnpm install',
            'pnpm build',
            'npm run build',
            'npx vite build',
            'npx next build',
            'pnpm run typecheck',
            'npm test',
            'vite --version',
            'echo what is next',
            'git status',
            'tail -20 /tmp/vite.log',
        ];
        for (const command of allowed) {
            expect(isLongLivedDevServerShellCommand(command), command).to.equal(false);
        }
    });

    it('denies shell control requests launching dev servers, with actionable guidance', () => {
        const denial = findQaiqDevServerGuardDenial({
            requestId: 'r1',
            toolName: 'Bash',
            toolInput: { command: 'nohup pnpm dev &' },
        });
        expect(denial).to.be.a('string');
        expect(denial).to.contain('expected local port');
    });

    it('lets non-shell tools and one-shot shell commands through', () => {
        expect(findQaiqDevServerGuardDenial({
            requestId: 'r2',
            toolName: 'Edit',
            toolInput: { command: 'pnpm dev' },
        })).to.equal(undefined);
        expect(findQaiqDevServerGuardDenial({
            requestId: 'r3',
            toolName: 'Bash',
            toolInput: { command: 'pnpm build' },
        })).to.equal(undefined);
    });
});
