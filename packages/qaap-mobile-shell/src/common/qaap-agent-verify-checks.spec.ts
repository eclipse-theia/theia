// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    buildVerifyRunCommand,
    resolveVerifyCheckFromScripts,
} from './qaap-agent-verify-checks';

describe('qaap-agent-verify-checks', () => {

    it('prefers compile over build and test', () => {
        const resolved = resolveVerifyCheckFromScripts({
            test: 'vitest run',
            build: 'vite build',
            compile: 'tsc -b',
        });
        expect(resolved?.script).to.equal('compile');
        expect(resolved?.kind).to.equal('build');
        expect(resolved?.command).to.equal('npm run compile');
    });

    it('falls back to build when compile is missing', () => {
        const resolved = resolveVerifyCheckFromScripts({
            test: 'vitest run',
            build: 'next build',
        });
        expect(resolved?.script).to.equal('build');
        expect(resolved?.command).to.equal('npm run build');
    });

    it('falls back to test when compile and build are missing', () => {
        const resolved = resolveVerifyCheckFromScripts({
            test: 'jest',
            lint: 'eslint .',
        });
        expect(resolved?.script).to.equal('test');
        expect(resolved?.kind).to.equal('test');
    });

    it('returns undefined when no known scripts exist', () => {
        expect(resolveVerifyCheckFromScripts({ dev: 'vite' })).to.equal(undefined);
        expect(resolveVerifyCheckFromScripts(undefined)).to.equal(undefined);
    });

    it('builds package-manager-specific run commands', () => {
        expect(buildVerifyRunCommand('build', 'pnpm')).to.equal('pnpm run build');
        expect(buildVerifyRunCommand('test', 'yarn')).to.equal('yarn test');
        expect(buildVerifyRunCommand('lint', 'bun')).to.equal('bun run lint');
    });

});
