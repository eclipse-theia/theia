// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { Path } from '@theia/core/lib/common/path';
import {
    AgentPluginManifestReader,
    AgentPluginRejectedError,
    ResolvedHttpServer,
    ResolvedPluginComponents,
    ResolvedStdioServer
} from './agent-plugin-manifest';

const PLUGIN_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';
const PLUGIN_ROOT = '/home/alex/.agents/plugins/devtools';
const PLUGIN_DATA = '/home/alex/.agents/plugins/data/devtools';

/**
 * Pins the native path form, which production otherwise takes from the backend OS. Both forms are
 * exercised below - the POSIX one against the POSIX-shaped fixtures, the Windows one against Windows
 * paths - so neither is left to the host the suite happens to run on: on a Windows runner the default
 * would turn every expected POSIX path into a backslashed one.
 *
 * Only the format is overridden, never `toNativePath` itself: overriding the conversion would mean the
 * production one is never executed by any test, and could be reverted to a no-op without a single test
 * going red.
 */
class PinnedAgentPluginManifestReader extends AgentPluginManifestReader {
    constructor(protected readonly format: Path.Format) {
        super();
    }
    protected override nativePathFormat(): Path.Format {
        return this.format;
    }
}

const reader = new PinnedAgentPluginManifestReader(Path.Format.Posix);

function manifest(fields: Record<string, unknown>): string {
    return JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'devtools', ...fields });
}

function mcp(mcpServers: Record<string, unknown>, schema: string = MCP_SCHEMA): string {
    return JSON.stringify({ $schema: schema, mcpServers });
}

function resolve(mcpJsonText: string | undefined, pluginData: string = PLUGIN_DATA): ResolvedPluginComponents {
    return reader.resolveComponents({ mcpJsonText, manifestSchema: PLUGIN_SCHEMA, pluginRoot: PLUGIN_ROOT, pluginData });
}

function stdio(components: ResolvedPluginComponents, name: string): ResolvedStdioServer {
    const server = components.servers.find(candidate => candidate.name === name);
    expect(server, `expected a resolved server named "${name}"`).to.not.be.undefined;
    expect(server!.kind).to.equal('stdio');
    return server as ResolvedStdioServer;
}

describe('AgentPluginManifestReader.parseManifest', () => {

    it('parses the minimal manifest from the specification', () => {
        // spec/1.0.0.md:157-162 - `$schema` and `name` are the only required fields.
        const parsed = reader.parseManifest(JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'minimal-plugin' }));
        expect(parsed.name).to.equal('minimal-plugin');
        expect(parsed.schema).to.equal(PLUGIN_SCHEMA);
        expect(parsed.warnings).to.deep.equal([]);
    });

    it('parses the full manifest from the specification, taking the author name from the author object', () => {
        // spec/1.0.0.md:166-187
        const parsed = reader.parseManifest(manifest({
            version: '1.2.0',
            description: 'Brief plugin description',
            author: { name: 'Author Name', email: 'author@example.com', url: 'https://example.com' },
            homepage: 'https://docs.example.com/plugin',
            repository: 'https://github.com/example/plugin',
            license: 'MIT',
            keywords: ['keyword1', 'keyword2'],
            extensions: { 'com.example.client': { setting: true } }
        }));
        expect(parsed).to.deep.equal({
            name: 'devtools',
            version: '1.2.0',
            description: 'Brief plugin description',
            authorName: 'Author Name',
            homepage: 'https://docs.example.com/plugin',
            keywords: ['keyword1', 'keyword2'],
            schema: PLUGIN_SCHEMA,
            warnings: []
        });
    });

    it('reports and ignores an unknown top-level field and still loads the plugin', () => {
        // spec/1.0.0.md:145 - unknown top-level fields are non-fatal: report, ignore, continue.
        const parsed = reader.parseManifest(manifest({ hooks: { onSave: 'x' } }));
        expect(parsed.name).to.equal('devtools');
        expect(parsed.warnings).to.have.lengthOf(1);
        expect(parsed.warnings[0]).to.contain('hooks');
    });

    it('reports and ignores a non-object extensions field and still loads the plugin', () => {
        // spec/1.0.0.md:427 - a non-object `extensions` field is non-fatal.
        const parsed = reader.parseManifest(manifest({ extensions: 'nope' }));
        expect(parsed.name).to.equal('devtools');
        expect(parsed.warnings).to.have.lengthOf(1);
        expect(parsed.warnings[0]).to.contain('extensions');
    });

    it('does not validate the contents of extension namespaces it does not implement', () => {
        // spec/1.0.0.md:427 - ignore unimplemented namespaces without validating their values.
        const parsed = reader.parseManifest(manifest({ extensions: { 'com.example.client': { anything: [1, 2, 3] } } }));
        expect(parsed.warnings).to.deep.equal([]);
    });

    it('rejects the plugin when name is missing', () => {
        // spec/1.0.0.md:196 - a missing required field rejects the plugin.
        expect(() => reader.parseManifest(JSON.stringify({ $schema: PLUGIN_SCHEMA }))).to.throw(AgentPluginRejectedError);
    });

    it('rejects the plugin when name is empty or violates the name constraints', () => {
        // spec/1.0.0.md:216-229 - lowercase alphanumerics, hyphens and periods, alphanumeric edges, no `--` or `..`.
        for (const name of ['', 'My-Plugin', '-start', 'has--double', 'too.many..dots', 'a'.repeat(65)]) {
            expect(() => reader.parseManifest(JSON.stringify({ $schema: PLUGIN_SCHEMA, name })), name).to.throw(AgentPluginRejectedError);
        }
        for (const name of ['my-plugin', 'acme.tools', 'lint3r', 'a']) {
            expect(reader.parseManifest(JSON.stringify({ $schema: PLUGIN_SCHEMA, name })).name, name).to.equal(name);
        }
    });

    it('rejects the plugin when the manifest is not JSON or not a JSON object', () => {
        // spec/1.0.0.md:143
        expect(() => reader.parseManifest('{')).to.throw(AgentPluginRejectedError);
        expect(() => reader.parseManifest('[]')).to.throw(AgentPluginRejectedError);
        expect(() => reader.parseManifest('"a string"')).to.throw(AgentPluginRejectedError);
    });

    it('rejects the plugin when $schema is missing, empty, wrong-typed or an unrecognized version', () => {
        // spec/1.0.0.md:153 - an unsupported declared version rejects the plugin.
        expect(() => reader.parseManifest(JSON.stringify({ name: 'devtools' }))).to.throw(AgentPluginRejectedError);
        expect(() => reader.parseManifest(JSON.stringify({ $schema: '', name: 'devtools' }))).to.throw(AgentPluginRejectedError);
        expect(() => reader.parseManifest(JSON.stringify({ $schema: 7, name: 'devtools' }))).to.throw(AgentPluginRejectedError);
        expect(() => reader.parseManifest(JSON.stringify({
            $schema: 'https://agent-plugins.org/schemas/2.0.0/plugin.schema.json', name: 'devtools'
        }))).to.throw(AgentPluginRejectedError);
        expect(() => reader.parseManifest(JSON.stringify({ $schema: MCP_SCHEMA, name: 'devtools' }))).to.throw(AgentPluginRejectedError);
    });

    it('rejects the plugin when author is not an object or carries an unknown or non-string field', () => {
        // spec/1.0.0.md:210 - "Any other field or value type makes the manifest invalid", and
        // spec/1.0.0.md:147 makes every violation other than the two non-fatal ones fatal.
        expect(() => reader.parseManifest(manifest({ author: 'Author Name' }))).to.throw(AgentPluginRejectedError);
        expect(() => reader.parseManifest(manifest({ author: { name: 'A', twitter: '@a' } }))).to.throw(AgentPluginRejectedError);
        expect(() => reader.parseManifest(manifest({ author: { name: 42 } }))).to.throw(AgentPluginRejectedError);
    });

    it('yields an undefined author name when the author object omits name', () => {
        expect(reader.parseManifest(manifest({ author: { email: 'a@example.com' } })).authorName).to.be.undefined;
    });

    it('rejects the plugin when an optional metadata field has the wrong JSON type', () => {
        // spec/1.0.0.md:147 - any other schema violation is fatal.
        expect(() => reader.parseManifest(manifest({ version: 1.2 }))).to.throw(AgentPluginRejectedError);
        expect(() => reader.parseManifest(manifest({ keywords: 'one' }))).to.throw(AgentPluginRejectedError);
        expect(() => reader.parseManifest(manifest({ keywords: ['one', 2] }))).to.throw(AgentPluginRejectedError);
    });

    it('reports every unknown top-level field, in manifest order', () => {
        // spec/1.0.0.md:145 - "Clients MUST report and ignore each unknown field".
        const parsed = reader.parseManifest(manifest({ hooks: {}, commands: [], agents: 'x' }));
        expect(parsed.warnings).to.have.lengthOf(3);
        expect(parsed.warnings[0]).to.contain('hooks');
        expect(parsed.warnings[1]).to.contain('commands');
        expect(parsed.warnings[2]).to.contain('agents');
    });

    it('accepts an empty keywords array and keeps it', () => {
        expect(reader.parseManifest(manifest({ keywords: [] })).keywords).to.deep.equal([]);
    });

    it('assigns no semantics to an unknown field, so an unknown "extensions"-like field cannot smuggle data in', () => {
        // spec/1.0.0.md:145 - "Clients MUST NOT assign semantics to unknown fields."
        const parsed = reader.parseManifest(manifest({ extension: { 'com.example.client': { setting: true } } })) as unknown as Record<string, unknown>;
        expect(parsed.extension).to.be.undefined;
    });

    it('does not reject a manifest solely because version is not semver or homepage is not a URL', () => {
        // spec/1.0.0.md:212 - metadata fields are validated only by their JSON types.
        const parsed = reader.parseManifest(manifest({ version: 'nightly', homepage: 'not a url', license: 'whatever' }));
        expect(parsed.version).to.equal('nightly');
        expect(parsed.homepage).to.equal('not a url');
    });
});

describe('AgentPluginManifestReader.resolveComponents', () => {

    it('resolves nothing and reports nothing when the plugin has no mcp.json', () => {
        // spec/1.0.0.md:263 - an absent fixed component location is not an error.
        expect(resolve(undefined)).to.deep.equal({ servers: [], skipped: [] });
    });

    it('accepts an empty mcpServers object, yielding no servers and no skips', () => {
        // spec/1.0.0.md:305 - "An empty `mcpServers` object is valid."
        expect(resolve(mcp({}))).to.deep.equal({ servers: [], skipped: [] });
    });

    it('resolves the worked mcp.json example from the specification', () => {
        // spec/1.0.0.md:365-391
        const components = resolve(mcp({
            'local-validator': {
                type: 'stdio',
                command: './bin/validator',
                args: ['--data', '${PLUGIN_DATA}/validator'],
                env: { CONFIG: '${PLUGIN_ROOT}/config.json' },
                cwd: '${PLUGIN_ROOT}'
            },
            'deployment-api': {
                type: 'streamable-http',
                url: 'https://deploy.example.com/mcp',
                headers: { 'X-Tenant': 'public-tenant' }
            },
            'legacy-events': {
                type: 'sse',
                url: 'https://legacy.example.com/sse'
            }
        }));
        expect(components.mcpDisabledReason).to.be.undefined;
        expect(stdio(components, 'local-validator')).to.deep.equal({
            kind: 'stdio',
            name: 'local-validator',
            command: `${PLUGIN_ROOT}/bin/validator`,
            args: ['--data', `${PLUGIN_DATA}/validator`],
            env: { CONFIG: `${PLUGIN_ROOT}/config.json` },
            cwd: PLUGIN_ROOT
        });
        expect(components.servers[1]).to.deep.equal({
            kind: 'http',
            name: 'deployment-api',
            serverUrl: 'https://deploy.example.com/mcp',
            headers: { 'X-Tenant': 'public-tenant' }
        } as ResolvedHttpServer);
        // spec/1.0.0.md:361 - `sse` support is OPTIONAL; spec/1.0.0.md:398 - skip and report it.
        expect(components.skipped).to.have.lengthOf(1);
        expect(components.skipped[0].name).to.equal('legacy-events');
        expect(components.skipped[0].reason).to.contain('sse');
    });

    it('accepts the valid command and cwd pair from the containment example', () => {
        // spec/1.0.0.md:66-94 - "both paths start with `./` and stay within the plugin root".
        const server = stdio(resolve(mcp({ server: { type: 'stdio', command: './bin/server', cwd: './data' } })), 'server');
        expect(server.command).to.equal(`${PLUGIN_ROOT}/bin/server`);
        expect(server.cwd).to.equal(`${PLUGIN_ROOT}/data`);
    });

    it('rejects the invalid command and cwd pair from the containment example', () => {
        // spec/1.0.0.md:66-94 - "`../bin/server` escapes the plugin root and `data` is not a plugin-relative path".
        const components = resolve(mcp({ server: { type: 'stdio', command: '../bin/server', cwd: 'data' } }));
        expect(components.servers).to.be.empty;
        expect(components.skipped).to.have.lengthOf(1);
        expect(components.skipped[0].name).to.equal('server');
        // Each half fails on its own, too.
        expect(resolve(mcp({ server: { type: 'stdio', command: '../bin/server' } })).servers).to.be.empty;
        expect(resolve(mcp({ server: { type: 'stdio', command: './bin/server', cwd: 'data' } })).servers).to.be.empty;
    });

    it('defaults cwd to the plugin root when the entry omits it', () => {
        // spec/1.0.0.md:331 - "When `cwd` is omitted, clients MUST use the plugin root".
        expect(stdio(resolve(mcp({ s: { type: 'stdio', command: 'npx' } })), 's').cwd).to.equal(PLUGIN_ROOT);
    });

    it('keeps a bare command verbatim for the platform to resolve', () => {
        // spec/1.0.0.md:325 - bare names are resolved using the platform's executable search rules.
        expect(stdio(resolve(mcp({ s: { type: 'stdio', command: 'npx' } })), 's').command).to.equal('npx');
    });

    it('invalidates an entry whose command is neither a bare name nor a ./-prefixed path', () => {
        // spec/1.0.0.md:325 - a `command` is a bare name or a plugin-relative path beginning with `./`.
        for (const command of ['/usr/bin/node', 'bin/server', 'node --inspect', '']) {
            expect(resolve(mcp({ s: { type: 'stdio', command } })).servers, command).to.be.empty;
        }
    });

    it('expands placeholders in args, env values and cwd', () => {
        // spec/1.0.0.md:475 - "Expansion applies to every string element of `args`, every string value
        // in `env`, and the `cwd` string."
        const server = stdio(resolve(mcp({
            s: {
                type: 'stdio',
                command: 'npx',
                args: ['--config', '${PLUGIN_ROOT}/config/db.json'],
                env: { DATA_DIR: '${PLUGIN_DATA}/database' },
                cwd: '${PLUGIN_DATA}/work'
            }
        })), 's');
        expect(server.args).to.deep.equal(['--config', `${PLUGIN_ROOT}/config/db.json`]);
        expect(server.env).to.deep.equal({ DATA_DIR: `${PLUGIN_DATA}/database` });
        expect(server.cwd).to.equal(`${PLUGIN_DATA}/work`);
    });

    it('does not expand placeholders in command or in env keys', () => {
        // spec/1.0.0.md:475 - "It does not apply to `env` keys, `command`, or fixed component locations."
        const server = stdio(resolve(mcp({
            s: { type: 'stdio', command: '${PLUGIN_ROOT}', env: { '${PLUGIN_ROOT}_TOOL': 'plain' } }
        })), 's');
        expect(server.command).to.equal('${PLUGIN_ROOT}');
        expect(server.env).to.deep.equal({ '${PLUGIN_ROOT}_TOOL': 'plain' });
    });

    it('does not expand placeholders in url or header values', () => {
        // spec/1.0.0.md:353 - no placeholder expansion in `url`, header names or header values.
        const components = resolve(mcp({
            s: {
                type: 'streamable-http',
                url: 'https://example.com/mcp?root=${PLUGIN_ROOT}',
                headers: { 'X-Root': 'v-${PLUGIN_ROOT}', 'X-Data': '${PLUGIN_DATA}' }
            }
        }));
        expect(components.servers[0]).to.deep.equal({
            kind: 'http',
            name: 's',
            serverUrl: 'https://example.com/mcp?root=${PLUGIN_ROOT}',
            headers: { 'X-Root': 'v-${PLUGIN_ROOT}', 'X-Data': '${PLUGIN_DATA}' }
        } as ResolvedHttpServer);
    });

    it('rejects a placeholder-shaped header name because braces are not valid HTTP header field characters', () => {
        // spec/1.0.0.md:353 - header names must be valid HTTP header fields, so a header name can never
        // legally contain `${...}`; non-expansion in header names is therefore unobservable and the entry
        // is invalid instead.
        expect(resolve(mcp({ s: { type: 'streamable-http', url: 'https://example.com/mcp', headers: { 'X-${PLUGIN_DATA}': 'a' } } })).servers).to.be.empty;
    });

    it('replaces every occurrence of a placeholder, not just the first', () => {
        // spec/1.0.0.md:473 - "every exact occurrence of either placeholder".
        const server = stdio(resolve(mcp({
            s: {
                type: 'stdio',
                command: 'npx',
                args: ['${PLUGIN_ROOT}/a:${PLUGIN_ROOT}/b', '${PLUGIN_DATA}-${PLUGIN_DATA}'],
                env: { BOTH: '${PLUGIN_ROOT};${PLUGIN_DATA};${PLUGIN_ROOT}' }
            }
        })), 's');
        expect(server.args).to.deep.equal([`${PLUGIN_ROOT}/a:${PLUGIN_ROOT}/b`, `${PLUGIN_DATA}-${PLUGIN_DATA}`]);
        expect(server.env).to.deep.equal({ BOTH: `${PLUGIN_ROOT};${PLUGIN_DATA};${PLUGIN_ROOT}` });
    });

    it('does not re-scan text introduced by a replacement', () => {
        // spec/1.0.0.md:473 - "Text introduced by a replacement MUST NOT be scanned for further placeholders."
        const trickyData = '/var/data/${PLUGIN_ROOT}/devtools';
        const server = stdio(resolve(mcp({
            s: { type: 'stdio', command: 'npx', args: ['${PLUGIN_DATA}/cache'], env: { D: '${PLUGIN_DATA}' } }
        }), trickyData), 's');
        expect(server.args).to.deep.equal([`${trickyData}/cache`]);
        expect(server.env).to.deep.equal({ D: trickyData });
    });

    it('leaves unrecognized placeholder-like text literal and performs no other variable expansion', () => {
        // spec/1.0.0.md:477
        const server = stdio(resolve(mcp({
            s: { type: 'stdio', command: 'npx', args: ['${PLUGIN_HOME}', '$PLUGIN_ROOT', '${env:FOO}', '$HOME'] }
        })), 's');
        expect(server.args).to.deep.equal(['${PLUGIN_HOME}', '$PLUGIN_ROOT', '${env:FOO}', '$HOME']);
    });

    it('never containment-checks args or env values, even when they look like escaping paths', () => {
        // spec/1.0.0.md:64 - "Configuration values not defined as paths, including command arguments and
        // environment variable values, are opaque strings."
        const server = stdio(resolve(mcp({
            s: { type: 'stdio', command: 'npx', args: ['../../etc/passwd', '${PLUGIN_ROOT}/../../elsewhere'], env: { P: '/etc/shadow' } }
        })), 's');
        expect(server.args).to.deep.equal(['../../etc/passwd', `${PLUGIN_ROOT}/../../elsewhere`]);
        expect(server.env).to.deep.equal({ P: '/etc/shadow' });
    });

    it('invalidates only the entry whose env declares a reserved variable name', () => {
        // spec/1.0.0.md:481 - an `env` entry named PLUGIN_ROOT or PLUGIN_DATA invalidates that server.
        const components = resolve(mcp({
            bad: { type: 'stdio', command: 'npx', env: { PLUGIN_ROOT: '/tmp' } },
            alsoBad: { type: 'stdio', command: 'npx', env: { PLUGIN_DATA: '/tmp' } },
            good: { type: 'stdio', command: 'npx' }
        }));
        expect(components.servers.map(server => server.name)).to.deep.equal(['good']);
        expect(components.skipped.map(entry => entry.name)).to.deep.equal(['bad', 'alsoBad']);
        expect(components.skipped[0].reason).to.contain('PLUGIN_ROOT');
    });

    it('invalidates an entry whose env declares a reserved variable name under any casing', () => {
        // Windows environment names are case-insensitive, so `Plugin_Root` there is the same variable
        // the client sets itself. Rejected everywhere, so a plugin cannot load on one platform and
        // silently misbehave on another.
        const components = resolve(mcp({
            lower: { type: 'stdio', command: 'npx', env: { plugin_root: '/tmp' } },
            mixed: { type: 'stdio', command: 'npx', env: { Plugin_Data: '/tmp' } },
            good: { type: 'stdio', command: 'npx' }
        }));
        expect(components.servers.map(server => server.name)).to.deep.equal(['good']);
        expect(components.skipped.map(entry => entry.name)).to.deep.equal(['lower', 'mixed']);
    });

    it('invalidates an entry that carries a field belonging to another variant', () => {
        // spec/1.0.0.md:313 - "a field belonging to another variant makes that server entry invalid".
        const components = resolve(mcp({
            stdioWithUrl: { type: 'stdio', command: 'npx', url: 'https://example.com/mcp' },
            httpWithCwd: { type: 'streamable-http', url: 'https://example.com/mcp', cwd: './data' },
            httpWithEnv: { type: 'streamable-http', url: 'https://example.com/mcp', env: { A: 'b' } },
            good: { type: 'stdio', command: 'npx' }
        }));
        expect(components.servers.map(server => server.name)).to.deep.equal(['good']);
        expect(components.skipped.map(entry => entry.name)).to.deep.equal(['stdioWithUrl', 'httpWithCwd', 'httpWithEnv']);
    });

    it('invalidates an entry with an unknown field or an unknown transport type', () => {
        // spec/1.0.0.md:313
        expect(resolve(mcp({ s: { type: 'stdio', command: 'npx', timeout: 5 } })).servers).to.be.empty;
        expect(resolve(mcp({ s: { type: 'websocket', url: 'https://example.com/mcp' } })).servers).to.be.empty;
        expect(resolve(mcp({ s: { command: 'npx' } })).servers).to.be.empty;
    });

    it('invalidates an entry that is missing a required field or types one wrongly', () => {
        // spec/1.0.0.md:317-323, spec/1.0.0.md:343-347
        expect(resolve(mcp({ s: { type: 'stdio' } })).servers).to.be.empty;
        expect(resolve(mcp({ s: { type: 'stdio', command: 12 } })).servers).to.be.empty;
        expect(resolve(mcp({ s: { type: 'stdio', command: 'npx', args: 'one' } })).servers).to.be.empty;
        expect(resolve(mcp({ s: { type: 'stdio', command: 'npx', args: ['one', 2] } })).servers).to.be.empty;
        expect(resolve(mcp({ s: { type: 'stdio', command: 'npx', env: { A: 2 } } })).servers).to.be.empty;
        expect(resolve(mcp({ s: { type: 'streamable-http' } })).servers).to.be.empty;
        expect(resolve(mcp({ s: 'not-an-object' })).servers).to.be.empty;
    });

    it('checks a ${PLUGIN_DATA}-rooted cwd against the plugin data directory rather than the plugin root', () => {
        // spec/1.0.0.md:337 - "A `${PLUGIN_DATA}`-rooted value MUST remain within the filesystem-resolved
        // plugin data directory."
        const inside = stdio(resolve(mcp({ s: { type: 'stdio', command: 'npx', cwd: '${PLUGIN_DATA}/venv' } })), 's');
        expect(inside.cwd).to.equal(`${PLUGIN_DATA}/venv`);
        expect(stdio(resolve(mcp({ s: { type: 'stdio', command: 'npx', cwd: '${PLUGIN_DATA}' } })), 's').cwd).to.equal(PLUGIN_DATA);
        // The data directory is a sibling tree of the plugin root (spec/1.0.0.md:464-469), so a
        // PLUGIN_DATA-rooted cwd is legal even though it lies outside the plugin root.
        expect(PLUGIN_DATA.startsWith(`${PLUGIN_ROOT}/`)).to.be.false;
    });

    it('invalidates an entry whose ${PLUGIN_DATA}-rooted cwd escapes the plugin data directory', () => {
        // spec/1.0.0.md:337 - "any post-resolution escape makes that server entry invalid".
        const components = resolve(mcp({ s: { type: 'stdio', command: 'npx', cwd: '${PLUGIN_DATA}/../other' } }));
        expect(components.servers).to.be.empty;
        expect(components.skipped[0].name).to.equal('s');
    });

    it('invalidates an entry whose ${PLUGIN_ROOT}-rooted or plugin-relative cwd escapes the plugin root', () => {
        // spec/1.0.0.md:337
        expect(resolve(mcp({ s: { type: 'stdio', command: 'npx', cwd: '${PLUGIN_ROOT}/../devtools-2' } })).servers).to.be.empty;
        expect(resolve(mcp({ s: { type: 'stdio', command: 'npx', cwd: './../devtools-2' } })).servers).to.be.empty;
    });

    it('invalidates an entry whose cwd has none of the three permitted forms', () => {
        // spec/1.0.0.md:331-337 - `./`, `${PLUGIN_ROOT}`-rooted or `${PLUGIN_DATA}`-rooted only.
        for (const cwd of ['data', '/absolute/data', '~/data', '${PLUGIN_HOME}/data', '${PLUGIN_ROOTX}', 42]) {
            expect(resolve(mcp({ s: { type: 'stdio', command: 'npx', cwd } })).servers, String(cwd)).to.be.empty;
        }
    });

    it('isolates failures per entry so that one invalid entry never affects the others', () => {
        // spec/1.0.0.md:397 - skip that server and continue loading other servers.
        const components = resolve(mcp({
            first: { type: 'stdio', command: './bin/a' },
            broken: { type: 'stdio', command: '../bin/b' },
            second: { type: 'streamable-http', url: 'https://example.com/mcp' },
            legacy: { type: 'sse', url: 'https://example.com/sse' },
            third: { type: 'stdio', command: 'npx', cwd: './work' }
        }));
        expect(components.servers.map(server => server.name)).to.deep.equal(['first', 'second', 'third']);
        expect(components.skipped.map(entry => entry.name)).to.deep.equal(['broken', 'legacy']);
        expect(components.mcpDisabledReason).to.be.undefined;
    });

    it('accepts an http url only when it is absolute, fragment-free, user-info-free and https unless loopback', () => {
        // spec/1.0.0.md:351
        for (const url of ['https://example.com/mcp', 'http://localhost:3000/mcp', 'http://127.0.0.1:3000/mcp', 'http://[::1]:3000/mcp']) {
            expect(resolve(mcp({ s: { type: 'streamable-http', url } })).servers, url).to.have.lengthOf(1);
        }
        for (const url of ['http://example.com/mcp', '/mcp', 'ftp://example.com/mcp', 'https://user:pw@example.com/mcp', 'https://example.com/mcp#frag']) {
            expect(resolve(mcp({ s: { type: 'streamable-http', url } })).servers, url).to.be.empty;
        }
    });

    it('invalidates an entry whose headers repeat a name under different casing or are not valid header fields', () => {
        // spec/1.0.0.md:353
        expect(resolve(mcp({ s: { type: 'streamable-http', url: 'https://example.com/mcp', headers: { 'X-Tenant': 'a', 'x-tenant': 'b' } } })).servers).to.be.empty;
        expect(resolve(mcp({ s: { type: 'streamable-http', url: 'https://example.com/mcp', headers: { 'X Tenant': 'a' } } })).servers).to.be.empty;
        expect(resolve(mcp({ s: { type: 'streamable-http', url: 'https://example.com/mcp', headers: { 'X-Tenant': 'a\r\nb' } } })).servers).to.be.empty;
        expect(resolve(mcp({ s: { type: 'streamable-http', url: 'https://example.com/mcp', headers: { 'X-Tenant': 2 } } })).servers).to.be.empty;
    });

    it('disables MCP without throwing when mcp.json is not valid JSON', () => {
        // spec/1.0.0.md:396
        const components = resolve('{ oops');
        expect(components.mcpDisabledReason).to.not.be.undefined;
        expect(components.servers).to.be.empty;
        expect(components.skipped).to.be.empty;
    });

    it('disables MCP when the top-level document has an extra field, a missing field or a wrong-typed field', () => {
        // spec/1.0.0.md:305 - exactly `$schema` and `mcpServers`, both required.
        expect(resolve(JSON.stringify({ $schema: MCP_SCHEMA, mcpServers: {}, timeout: 1 })).mcpDisabledReason).to.not.be.undefined;
        expect(resolve(JSON.stringify({ $schema: MCP_SCHEMA })).mcpDisabledReason).to.not.be.undefined;
        expect(resolve(JSON.stringify({ mcpServers: {} })).mcpDisabledReason).to.not.be.undefined;
        expect(resolve(JSON.stringify({ $schema: MCP_SCHEMA, mcpServers: [] })).mcpDisabledReason).to.not.be.undefined;
        expect(resolve('[]').mcpDisabledReason).to.not.be.undefined;
    });

    it('disables MCP when mcp.json targets an unsupported Agent Plugins version', () => {
        // spec/1.0.0.md:396
        const components = resolve(mcp({ s: { type: 'stdio', command: 'npx' } }, 'https://agent-plugins.org/schemas/2.0.0/mcp.schema.json'));
        expect(components.mcpDisabledReason).to.not.be.undefined;
        expect(components.servers).to.be.empty;
    });

    it('disables MCP without throwing when the mcp.json and plugin.json schema versions differ', () => {
        // spec/1.0.0.md:508 - a mismatch invalidates the MCP configuration only, not other component types.
        const components = reader.resolveComponents({
            mcpJsonText: mcp({ s: { type: 'stdio', command: 'npx' } }),
            manifestSchema: 'https://agent-plugins.org/schemas/0.9.0/plugin.schema.json',
            pluginRoot: PLUGIN_ROOT,
            pluginData: PLUGIN_DATA
        });
        expect(components.mcpDisabledReason).to.not.be.undefined;
        expect(components.servers).to.be.empty;
        expect(components.skipped).to.be.empty;
    });

    it('accepts a plugin-relative cwd or command that only traverses inside the plugin root', () => {
        // spec/1.0.0.md:63 - resolution happens first, containment is checked on the resolved path.
        const server = stdio(resolve(mcp({ s: { type: 'stdio', command: './bin/../bin/server', cwd: './work/../data/nested' } })), 's');
        expect(server.command).to.equal(`${PLUGIN_ROOT}/bin/server`);
        expect(server.cwd).to.equal(`${PLUGIN_ROOT}/data/nested`);
    });

    it('resolves a bare "./" cwd to the plugin root without a trailing separator', () => {
        expect(stdio(resolve(mcp({ s: { type: 'stdio', command: 'npx', cwd: './' } })), 's').cwd).to.equal(PLUGIN_ROOT);
        expect(stdio(resolve(mcp({ s: { type: 'stdio', command: 'npx', cwd: '${PLUGIN_ROOT}/' } })), 's').cwd).to.equal(PLUGIN_ROOT);
    });

    it('keeps an empty env object and omits absent optional fields', () => {
        const server = stdio(resolve(mcp({ s: { type: 'stdio', command: 'npx', env: {} } })), 's');
        expect(server.env).to.deep.equal({});
        expect(server.args).to.be.undefined;
        const http = resolve(mcp({ s: { type: 'streamable-http', url: 'https://example.com/mcp' } })).servers[0] as ResolvedHttpServer;
        expect(http.headers).to.be.undefined;
    });

    it('skips an entry whose type is not a string and reports the missing type', () => {
        const components = resolve(mcp({ s: { type: 42, command: 'npx' } }));
        expect(components.servers).to.be.empty;
        expect(components.skipped[0].reason).to.contain('type');
    });

    it('returns every resolved path in the native form on Windows, so nothing reaches a spawn as /c:/…', () => {
        // Theia's `Path` canonicalizes a Windows drive path to the `/c:/…` form, which is what
        // containment is decided in - and which no `spawn` accepts. Every value that leaves the reader
        // has to be converted back, `args` and `env` included: `cwd` alone is not enough.
        const components = new PinnedAgentPluginManifestReader(Path.Format.Windows).resolveComponents({
            mcpJsonText: mcp({
                s: {
                    type: 'stdio',
                    command: './bin/validator.cmd',
                    args: ['--config', '${PLUGIN_ROOT}/config.json'],
                    env: { DATA: '${PLUGIN_DATA}' },
                    cwd: '${PLUGIN_ROOT}/data'
                }
            }),
            manifestSchema: PLUGIN_SCHEMA,
            pluginRoot: 'C:\\plugins\\devtools',
            pluginData: 'C:\\plugins\\data\\devtools'
        });
        const server = stdio(components, 's');
        expect(server.command).to.equal('C:\\plugins\\devtools\\bin\\validator.cmd');
        expect(server.cwd).to.equal('C:\\plugins\\devtools\\data');
        // Only what the placeholder stands for is native. The rest of the argument is the plugin's own
        // text and stays verbatim - `args` are opaque strings, not necessarily paths (spec/1.0.0.md:64).
        expect(server.args).to.deep.equal(['--config', 'C:\\plugins\\devtools/config.json']);
        expect(server.env).to.deep.equal({ DATA: 'C:\\plugins\\data\\devtools' });
    });

    it('defaults cwd to the plugin root in native form when the entry omits it', () => {
        const components = new PinnedAgentPluginManifestReader(Path.Format.Windows).resolveComponents({
            mcpJsonText: mcp({ s: { type: 'stdio', command: 'npx' } }),
            manifestSchema: PLUGIN_SCHEMA,
            pluginRoot: 'C:\\plugins\\devtools',
            pluginData: 'C:\\plugins\\data\\devtools'
        });
        expect(stdio(components, 's').cwd).to.equal('C:\\plugins\\devtools');
    });

    it('rejects a Windows-style plugin-relative command that escapes the plugin root', () => {
        const components = reader.resolveComponents({
            mcpJsonText: mcp({ s: { type: 'stdio', command: './..\\..\\evil.exe' } }),
            manifestSchema: PLUGIN_SCHEMA,
            pluginRoot: 'C:\\plugins\\devtools',
            pluginData: 'C:\\plugins\\data\\devtools'
        });
        expect(components.servers).to.be.empty;
    });

    it('keeps the double leading separator of a UNC plugin root, so it stays the same location', () => {
        // `Path.normalize` drops empty segments, which would fold `\\server\share` to `/server/share`.
        // The backend derives PLUGIN_ROOT with Node's `path.join`, which keeps the UNC prefix, so a
        // collapsed `cwd` would point somewhere else than the root the same entry advertises.
        const components = new PinnedAgentPluginManifestReader(Path.Format.Windows).resolveComponents({
            mcpJsonText: mcp({ s: { type: 'stdio', command: './bin/a', args: ['${PLUGIN_ROOT}'] } }),
            manifestSchema: PLUGIN_SCHEMA,
            pluginRoot: '\\\\server\\share\\plugins\\devtools',
            pluginData: '\\\\server\\share\\plugin-data\\devtools'
        });
        const server = stdio(components, 's');
        expect(server.command).to.equal('\\\\server\\share\\plugins\\devtools\\bin\\a');
        expect(server.cwd).to.equal('\\\\server\\share\\plugins\\devtools');
        expect(server.args).to.deep.equal(['\\\\server\\share\\plugins\\devtools']);
    });

    it('still contains a UNC-rooted plugin, so a ../ escape is rejected there too', () => {
        const components = new PinnedAgentPluginManifestReader(Path.Format.Windows).resolveComponents({
            mcpJsonText: mcp({ s: { type: 'stdio', command: './../../elsewhere/evil.exe' } }),
            manifestSchema: PLUGIN_SCHEMA,
            pluginRoot: '\\\\server\\share\\plugins\\devtools',
            pluginData: '\\\\server\\share\\plugin-data\\devtools'
        });
        expect(components.servers).to.be.empty;
    });

    it('normalizes a plugin root and plugin data path that carry a trailing separator or dot segments', () => {
        const components = reader.resolveComponents({
            mcpJsonText: mcp({ s: { type: 'stdio', command: './bin/a', cwd: '${PLUGIN_DATA}' } }),
            manifestSchema: PLUGIN_SCHEMA,
            pluginRoot: '/plugins/./devtools/',
            pluginData: '/plugins/data/x/../devtools'
        });
        const server = stdio(components, 's');
        expect(server.command).to.equal('/plugins/devtools/bin/a');
        expect(server.cwd).to.equal('/plugins/data/devtools');
    });
});
