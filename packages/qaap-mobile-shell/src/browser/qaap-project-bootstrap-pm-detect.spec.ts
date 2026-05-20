// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    parseDeclaredPackageManager,
    parseNpmrcPackageManager,
    parsePnpmWorkspaceYaml,
} from './qaap-project-bootstrap-pm-detect';

describe('parseDeclaredPackageManager', () => {

    it('accepts name-only and name@version Corepack values', () => {
        expect(parseDeclaredPackageManager('pnpm')).to.equal('pnpm');
        expect(parseDeclaredPackageManager('pnpm@9.15.0')).to.equal('pnpm');
        expect(parseDeclaredPackageManager('npm@10.8.2')).to.equal('npm');
        expect(parseDeclaredPackageManager('yarn@1.22.22')).to.equal('yarn');
        expect(parseDeclaredPackageManager('bun@1.2.0')).to.equal('bun');
    });

    it('rejects unknown package managers', () => {
        expect(parseDeclaredPackageManager('deno')).to.equal(undefined);
        expect(parseDeclaredPackageManager('')).to.equal(undefined);
    });

});

describe('parseNpmrcPackageManager', () => {

    it('reads package-manager from npmrc', () => {
        const content = '# comment\npackage-manager=pnpm\n';
        expect(parseNpmrcPackageManager(content)).to.equal('pnpm');
    });

});

describe('parsePnpmWorkspaceYaml', () => {

    it('parses quoted and unquoted workspace globs', () => {
        const yaml = `packages:
  - 'packages/*'
  - "apps/*"
  - packages/*
  - '!**/fixtures/**'
`;
        expect(parsePnpmWorkspaceYaml(yaml)).to.deep.equal(['packages/*', 'apps/*', 'packages/*']);
    });

});
