// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { buildBootstrapInstallCommand } from './qaap-project-bootstrap-install';

describe('qaap-project-bootstrap-install', () => {

    it('buildBootstrapInstallCommand forces dev dependencies for npm', () => {
        expect(buildBootstrapInstallCommand('npm')).to.equal('NODE_ENV=development npm install --include=dev');
    });

    it('buildBootstrapInstallCommand forces dev dependencies for pnpm/yarn/bun', () => {
        expect(buildBootstrapInstallCommand('pnpm')).to.equal('NODE_ENV=development pnpm install');
        expect(buildBootstrapInstallCommand('yarn')).to.equal('NODE_ENV=development yarn install');
        expect(buildBootstrapInstallCommand('bun')).to.equal('NODE_ENV=development bun install');
    });
});
