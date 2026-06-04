// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { buildStaticServeCommand } from './qaap-project-bootstrap-static';

describe('qaap-project-bootstrap-static', () => {

    describe('buildStaticServeCommand', () => {

        it('serves the workspace root when given "."', () => {
            const cmd = buildStaticServeCommand('.');
            expect(cmd).to.match(/^QAAP_STATIC_ROOT="\." node -e '/);
            expect(cmd).to.include('http.createServer');
            expect(cmd.endsWith("'")).to.equal(true);
        });

        it('defaults to "." when the directory is empty', () => {
            expect(buildStaticServeCommand('')).to.equal(buildStaticServeCommand('.'));
        });

        it('embeds a subdirectory serve root', () => {
            expect(buildStaticServeCommand('public')).to.include('QAAP_STATIC_ROOT="public"');
        });

        it('reads the port from the PORT env var so the bootstrap port wrapper can inject it', () => {
            expect(buildStaticServeCommand('.')).to.include('process.env.PORT');
        });

        it('binds to loopback so the same-origin dev preview proxy can reach it', () => {
            expect(buildStaticServeCommand('.')).to.include('"127.0.0.1"');
        });

        it('prints a localhost URL the dev-output scanner can detect', () => {
            expect(buildStaticServeCommand('.')).to.include('http://127.0.0.1:');
        });

        it('embeds a script free of single quotes (so node -e \'...\' stays valid)', () => {
            const cmd = buildStaticServeCommand('.');
            const script = cmd.slice(cmd.indexOf("node -e '") + "node -e '".length, -1);
            expect(script.includes("'")).to.equal(false);
        });

        it('escapes double quotes in the directory name', () => {
            expect(buildStaticServeCommand('we"ird')).to.include('QAAP_STATIC_ROOT="we\\"ird"');
        });
    });
});
