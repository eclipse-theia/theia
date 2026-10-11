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

import { nls } from '@theia/core';
import { Path } from '@theia/core/lib/common/path';
import { injectable } from '@theia/core/shared/inversify';

/** Parsed `plugin.json`, restricted to the fields Theia uses. */
export interface AgentPluginManifest {
    name: string;
    version?: string;
    description?: string;
    authorName?: string;
    homepage?: string;
    keywords?: string[];
    /** The `$schema` value, so the caller can enforce the plugin.json/mcp.json version match. */
    schema: string;
    /**
     * Non-fatal problems that the specification requires the client to report and ignore,
     * i.e. unknown top-level fields and a non-object `extensions` field. Already localized.
     */
    warnings: string[];
}

/**
 * Every resolved path here is in the filesystem's native form and can be handed to a spawn as is.
 * Containment is checked in Theia's `Path` form internally, but that form never leaves this service:
 * on Windows it renders a drive path as `/c:/…`, which no `spawn` accepts.
 */
export interface ResolvedStdioServer {
    kind: 'stdio';
    name: string;
    /** Bare executable name kept verbatim, or a `./`-relative path resolved against the plugin root. */
    command: string;
    args?: string[];
    env?: Record<string, string>;
    /** Always set: `cwd` defaults to the plugin root when the entry omits it. */
    cwd: string;
}

/** A resolved `streamable-http` MCP server entry of a plugin's `mcp.json`. */
export interface ResolvedHttpServer {
    kind: 'http';
    name: string;
    serverUrl: string;
    headers?: Record<string, string>;
}

export type ResolvedPluginServer = ResolvedStdioServer | ResolvedHttpServer;

/** One component the client refused to load, and why - surfaced on the plugin's card. */
export interface SkippedPluginComponent {
    /** Component name, e.g. the `mcpServers` key or the skill directory name. */
    name: string;
    /** Human-readable, already localized. */
    reason: string;
}

/** The outcome of resolving a plugin's `mcp.json`. */
export interface ResolvedPluginComponents {
    servers: ResolvedPluginServer[];
    skipped: SkippedPluginComponent[];
    /** Set when `mcp.json` as a whole was rejected, disabling MCP for the plugin. Already localized. */
    mcpDisabledReason?: string;
}

/** Input of {@link AgentPluginManifestReader.resolveComponents}. */
export interface ResolveComponentsOptions {
    /** Raw `mcp.json` text, or undefined when the plugin has no `mcp.json`. */
    mcpJsonText?: string;
    /** The `$schema` from `plugin.json`, for the version-match rule. */
    manifestSchema: string;
    /** Absolute, already filesystem-resolved plugin root. */
    pluginRoot: string;
    /** Absolute, already filesystem-resolved plugin data directory. */
    pluginData: string;
}

/** Thrown only for conditions the spec says are fatal to the whole plugin. */
export class AgentPluginRejectedError extends Error { }

/** `$schema` selects the rules; the schema documents themselves are never fetched. */
export const SUPPORTED_AGENT_PLUGINS_VERSIONS: readonly string[] = ['1.0.0'];

/** One invalid `mcpServers` entry is skipped without affecting other entries or component types. */
class ServerEntryInvalid extends Error { }

const MANIFEST_FIELDS = ['$schema', 'name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'extensions'];
const AUTHOR_FIELDS = ['name', 'email', 'url'];
const STDIO_FIELDS = ['type', 'command', 'args', 'env', 'cwd'];
const HTTP_FIELDS = ['type', 'url', 'headers'];
/** Reserved variables the client supplies itself; a plugin must not declare them. */
const RESERVED_ENV_NAMES = ['PLUGIN_ROOT', 'PLUGIN_DATA'];
/** `${NAME}` only; braces are mandatory and there is no `$NAME` form. */
const PLACEHOLDER_PATTERN = /\$\{(PLUGIN_ROOT|PLUGIN_DATA)\}/g;
const MANIFEST_NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
/** RFC 7230 token, i.e. a valid HTTP header field name. */
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
/** Horizontal tab, space, visible ASCII and obs-text. */
const HEADER_VALUE_PATTERN = /^[\t\x20-\x7e\x80-\xff]*$/;

/**
 * Validates, expands and resolves `plugin.json` and `mcp.json` per Agent Plugins v1.0.0.
 *
 * Performs no filesystem and no network access: the caller walks the plugin directory and hands in
 * the file contents plus the already filesystem-resolved plugin root and data directory.
 */
@injectable()
export class AgentPluginManifestReader {

    /**
     * Only two schema violations are non-fatal - an unknown top-level field and a non-object
     * `extensions` - and both are reported via {@link AgentPluginManifest.warnings} and ignored.
     *
     * @throws AgentPluginRejectedError on any other violation.
     */
    parseManifest(pluginJsonText: string): AgentPluginManifest {
        let parsed: unknown;
        try {
            parsed = this.parseJson(pluginJsonText);
        } catch (error) {
            throw new AgentPluginRejectedError(nls.localize('theia/ai-registry/plugin/manifestNotJson', '"plugin.json" is not valid JSON.'));
        }
        if (!this.isRecord(parsed)) {
            throw new AgentPluginRejectedError(
                nls.localize('theia/ai-registry/plugin/manifestNotObject', '"plugin.json" must contain a top-level JSON object.'));
        }
        const warnings: string[] = [];
        for (const field of Object.keys(parsed)) {
            if (!MANIFEST_FIELDS.includes(field)) {
                warnings.push(nls.localize('theia/ai-registry/plugin/unknownManifestField',
                    'Ignoring the unknown "plugin.json" field "{0}".', field));
            }
        }
        const schema = this.requiredString(parsed, '$schema');
        if (this.pluginSchemaVersion(schema) === undefined) {
            throw new AgentPluginRejectedError(nls.localize('theia/ai-registry/plugin/manifestUnsupportedVersion',
                '"plugin.json" targets the unsupported Agent Plugins schema "{0}".', schema));
        }
        const name = this.requiredString(parsed, 'name');
        if (name.length > 64 || !MANIFEST_NAME_PATTERN.test(name)) {
            throw new AgentPluginRejectedError(nls.localize('theia/ai-registry/plugin/manifestInvalidName',
                'The plugin name "{0}" is invalid: it must be 1 to 64 lowercase alphanumeric characters, hyphens or periods, '
                + 'must start and end with an alphanumeric character and must not contain "--" or "..".', name));
        }
        if ('extensions' in parsed && !this.isRecord(parsed.extensions)) {
            warnings.push(nls.localize('theia/ai-registry/plugin/nonObjectExtensions',
                'Ignoring the "extensions" field of "plugin.json" because it is not an object.'));
        }
        return {
            name,
            version: this.optionalString(parsed, 'version'),
            description: this.optionalString(parsed, 'description'),
            authorName: this.authorName(parsed),
            homepage: this.optionalString(parsed, 'homepage'),
            keywords: this.keywords(parsed),
            schema,
            warnings
        };
    }

    /**
     * A rejected document only disables MCP for the plugin
     * ({@link ResolvedPluginComponents.mcpDisabledReason}); a rejected entry only skips that entry.
     * Neither affects skills, and nothing here throws.
     */
    resolveComponents(options: ResolveComponentsOptions): ResolvedPluginComponents {
        if (options.mcpJsonText === undefined) {
            // An absent fixed component location is not an error.
            return { servers: [], skipped: [] };
        }
        const pluginRoot = this.normalizePath(options.pluginRoot);
        const pluginData = this.normalizePath(options.pluginData);
        let parsed: unknown;
        try {
            parsed = this.parseJson(options.mcpJsonText);
        } catch (error) {
            return this.mcpDisabled(nls.localize('theia/ai-registry/plugin/mcpNotJson', '"mcp.json" is not valid JSON.'));
        }
        const invalidDocument = nls.localize('theia/ai-registry/plugin/mcpInvalidDocument',
            '"mcp.json" must contain a top-level JSON object with exactly the required "$schema" and "mcpServers" fields.');
        if (!this.isRecord(parsed) || !this.isRecord(parsed.mcpServers) || typeof parsed.$schema !== 'string'
            || Object.keys(parsed).some(field => field !== '$schema' && field !== 'mcpServers')) {
            return this.mcpDisabled(invalidDocument);
        }
        const mcpVersion = this.mcpSchemaVersion(parsed.$schema);
        if (mcpVersion === undefined) {
            return this.mcpDisabled(nls.localize('theia/ai-registry/plugin/mcpUnsupportedVersion',
                '"mcp.json" targets the unsupported Agent Plugins schema "{0}".', parsed.$schema));
        }
        const manifestVersion = this.pluginSchemaVersion(options.manifestSchema);
        if (manifestVersion === undefined || manifestVersion !== mcpVersion) {
            return this.mcpDisabled(nls.localize('theia/ai-registry/plugin/mcpVersionMismatch',
                '"mcp.json" targets Agent Plugins version "{0}" but "plugin.json" targets "{1}".', mcpVersion, manifestVersion ?? options.manifestSchema));
        }
        const servers: ResolvedPluginServer[] = [];
        const skipped: SkippedPluginComponent[] = [];
        for (const [name, entry] of Object.entries(parsed.mcpServers)) {
            try {
                servers.push(this.resolveServer(name, entry, pluginRoot, pluginData));
            } catch (error) {
                skipped.push({ name, reason: this.skipReason(error) });
            }
        }
        return { servers, skipped };
    }

    protected resolveServer(name: string, entry: unknown, pluginRoot: string, pluginData: string): ResolvedPluginServer {
        if (!this.isRecord(entry)) {
            throw this.entryInvalid(nls.localize('theia/ai-registry/plugin/serverNotObject', 'The server configuration is not a JSON object.'));
        }
        const type = entry.type;
        if (typeof type !== 'string') {
            throw this.entryInvalid(nls.localize('theia/ai-registry/plugin/serverMissingField',
                'The server configuration is missing the required "{0}" field.', 'type'));
        }
        if (type === 'sse') {
            // `sse` support is OPTIONAL; Theia supports `stdio` and `streamable-http`.
            throw this.entryInvalid(nls.localize('theia/ai-registry/plugin/serverUnsupportedTransport',
                'The MCP transport "{0}" is not supported.', type));
        }
        if (type === 'stdio') {
            return this.resolveStdioServer(name, entry, pluginRoot, pluginData);
        }
        if (type === 'streamable-http') {
            return this.resolveHttpServer(name, entry);
        }
        throw this.entryInvalid(nls.localize('theia/ai-registry/plugin/serverUnknownType',
            'The server configuration declares the unknown transport type "{0}".', type));
    }

    protected resolveStdioServer(name: string, entry: Record<string, unknown>, pluginRoot: string, pluginData: string): ResolvedStdioServer {
        this.checkClosedFields(entry, STDIO_FIELDS);
        // `args` and `env` values are opaque strings that are never containment-checked, so they are
        // expanded with the native paths straight away. `command` and `cwd` are resolved in `Path` form,
        // because containment is decided there, and converted once the check has passed.
        const nativeRoot = this.toNativePath(pluginRoot);
        const nativeData = this.toNativePath(pluginData);
        const command = this.resolveCommand(this.requiredEntryString(entry, 'command'), pluginRoot);
        const args = this.args(entry, nativeRoot, nativeData);
        const env = this.env(entry, nativeRoot, nativeData);
        const cwd = this.resolveCwd(entry, pluginRoot, pluginData);
        return { kind: 'stdio', name, command, args, env, cwd };
    }

    protected resolveHttpServer(name: string, entry: Record<string, unknown>): ResolvedHttpServer {
        this.checkClosedFields(entry, HTTP_FIELDS);
        // No placeholder expansion in `url`, header names or header values.
        const serverUrl = this.requiredEntryString(entry, 'url');
        this.checkUrl(serverUrl);
        return { kind: 'http', name, serverUrl, headers: this.headers(entry) };
    }

    /**
     * `command` is a single executable token, never a shell command string, and placeholders are never
     * expanded in it.
     */
    protected resolveCommand(command: string, pluginRoot: string): string {
        if (command.startsWith('./')) {
            return this.toNativePath(this.resolveContained(command, pluginRoot, pluginRoot, 'command'));
        }
        // A bare name is a single token, so it can neither be a path nor a shell command string.
        if (command.includes('/') || command.includes('\\') || /\s/.test(command)) {
            throw this.entryInvalid(nls.localize('theia/ai-registry/plugin/serverInvalidCommand',
                'The "command" value "{0}" must be a bare executable name or a plugin-relative path beginning with "./".', command));
        }
        return command;
    }

    /**
     * Omitted `cwd` means the plugin root. A `./`- or `${PLUGIN_ROOT}`-rooted value must stay inside
     * the plugin root; a `${PLUGIN_DATA}`-rooted one must stay inside the data directory.
     */
    protected resolveCwd(entry: Record<string, unknown>, pluginRoot: string, pluginData: string): string {
        if (entry.cwd === undefined) {
            return this.toNativePath(pluginRoot);
        }
        const cwd = this.entryString(entry, 'cwd');
        const relative = cwd.startsWith('./');
        const rootRelative = cwd === '${PLUGIN_ROOT}' || cwd.startsWith('${PLUGIN_ROOT}/');
        const dataRelative = cwd === '${PLUGIN_DATA}' || cwd.startsWith('${PLUGIN_DATA}/');
        if (!relative && !rootRelative && !dataRelative) {
            throw this.entryInvalid(nls.localize('theia/ai-registry/plugin/serverInvalidCwd',
                'The "cwd" value "{0}" must begin with "./", "${PLUGIN_ROOT}" or "${PLUGIN_DATA}".', cwd));
        }
        const expanded = this.expand(cwd, pluginRoot, pluginData);
        const containmentRoot = dataRelative ? pluginData : pluginRoot;
        return this.toNativePath(this.resolveContained(expanded, containmentRoot, relative ? pluginRoot : undefined, 'cwd'));
    }

    /** @throws ServerEntryInvalid when `value` resolves outside `containmentRoot`. */
    protected resolveContained(value: string, containmentRoot: string, base: string | undefined, field: string): string {
        const resolved = base === undefined
            ? this.normalizePath(value)
            : this.normalizePath(new Path(base).join(value).toString());
        if (!new Path(containmentRoot).isEqualOrParent(new Path(resolved))) {
            throw this.entryInvalid(nls.localize('theia/ai-registry/plugin/serverPathEscapes',
                'The "{0}" value "{1}" resolves outside "{2}".', field, value, containmentRoot));
        }
        return resolved;
    }

    /**
     * Single non-recursive pass: replacement text is never re-scanned, and unrecognized
     * placeholder-like text stays literal.
     */
    protected expand(value: string, pluginRoot: string, pluginData: string): string {
        return value.replace(PLACEHOLDER_PATTERN, (_match, placeholder) => placeholder === 'PLUGIN_ROOT' ? pluginRoot : pluginData);
    }

    protected args(entry: Record<string, unknown>, nativeRoot: string, nativeData: string): string[] | undefined {
        if (entry.args === undefined) {
            return undefined;
        }
        if (!Array.isArray(entry.args) || entry.args.some(element => typeof element !== 'string')) {
            throw this.entryInvalid(nls.localize('theia/ai-registry/plugin/serverInvalidArgs', 'The "args" field must be an array of strings.'));
        }
        // `args` are opaque strings and are never containment-checked.
        return entry.args.map(element => this.expand(element as string, nativeRoot, nativeData));
    }

    protected env(entry: Record<string, unknown>, nativeRoot: string, nativeData: string): Record<string, string> | undefined {
        if (entry.env === undefined) {
            return undefined;
        }
        if (!this.isRecord(entry.env)) {
            throw this.entryInvalid(nls.localize('theia/ai-registry/plugin/serverInvalidEnv', 'The "env" field must be an object of strings.'));
        }
        const env: Record<string, string> = {};
        for (const [key, value] of Object.entries(entry.env)) {
            // Compared case-insensitively: Windows environment names are, so `Plugin_Root` there is the
            // same variable we set ourselves, and rejecting it everywhere keeps a plugin from loading on
            // one platform and failing on another.
            if (RESERVED_ENV_NAMES.includes(key.toUpperCase())) {
                throw this.entryInvalid(nls.localize('theia/ai-registry/plugin/serverReservedEnv',
                    'The "env" entry "{0}" is reserved and must not be declared by a plugin.', key));
            }
            if (typeof value !== 'string') {
                throw this.entryInvalid(nls.localize('theia/ai-registry/plugin/serverInvalidEnv', 'The "env" field must be an object of strings.'));
            }
            env[key] = this.expand(value, nativeRoot, nativeData);
        }
        return env;
    }

    protected headers(entry: Record<string, unknown>): Record<string, string> | undefined {
        if (entry.headers === undefined) {
            return undefined;
        }
        if (!this.isRecord(entry.headers)) {
            throw this.entryInvalid(nls.localize('theia/ai-registry/plugin/serverInvalidHeaders', 'The "headers" field must be an object of strings.'));
        }
        const headers: Record<string, string> = {};
        const seen = new Set<string>();
        for (const [key, value] of Object.entries(entry.headers)) {
            if (typeof value !== 'string' || !HEADER_NAME_PATTERN.test(key) || !this.isValidHeaderValue(value)) {
                throw this.entryInvalid(nls.localize('theia/ai-registry/plugin/serverInvalidHeader',
                    'The header "{0}" is not a valid HTTP header field.', key));
            }
            // Header names are case-insensitive, so a repeat under different casing is a duplicate.
            if (seen.has(key.toLowerCase())) {
                throw this.entryInvalid(nls.localize('theia/ai-registry/plugin/serverDuplicateHeader',
                    'The header name "{0}" is declared more than once.', key));
            }
            seen.add(key.toLowerCase());
            headers[key] = value;
        }
        return headers;
    }

    protected isValidHeaderValue(value: string): boolean {
        return HEADER_VALUE_PATTERN.test(value);
    }

    /**
     * The `url` must be absolute http(s) without user information and without a fragment, and a
     * non-loopback endpoint must use https.
     */
    protected checkUrl(serverUrl: string): void {
        const invalid = (): ServerEntryInvalid => this.entryInvalid(nls.localize('theia/ai-registry/plugin/serverInvalidUrl',
            'The "url" value "{0}" must be an absolute http or https URL without user information and without a fragment, '
            + 'and a non-loopback URL must use https.', serverUrl));
        let url: URL;
        try {
            url = new URL(serverUrl);
        } catch (error) {
            throw invalid();
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw invalid();
        }
        if (url.username || url.password || serverUrl.includes('#')) {
            throw invalid();
        }
        if (url.protocol === 'http:' && !this.isLoopbackHost(url.hostname)) {
            throw invalid();
        }
    }

    protected isLoopbackHost(hostname: string): boolean {
        if (hostname === 'localhost' || hostname === '[::1]' || hostname === '::1') {
            return true;
        }
        const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
        return !!ipv4 && Number(ipv4[1]) === 127 && ipv4.slice(1).every(part => Number(part) <= 255);
    }

    protected pluginSchemaVersion(schema: string): string | undefined {
        return this.schemaVersion(schema, 'plugin');
    }

    protected mcpSchemaVersion(schema: string): string | undefined {
        return this.schemaVersion(schema, 'mcp');
    }

    protected schemaVersion(schema: string, document: 'plugin' | 'mcp'): string | undefined {
        return SUPPORTED_AGENT_PLUGINS_VERSIONS.find(version => schema === `https://agent-plugins.org/schemas/${version}/${document}.schema.json`);
    }

    protected checkClosedFields(entry: Record<string, unknown>, allowed: string[]): void {
        for (const field of Object.keys(entry)) {
            if (!allowed.includes(field)) {
                throw this.entryInvalid(nls.localize('theia/ai-registry/plugin/serverUnknownField',
                    'The server configuration declares the field "{0}", which is not permitted for its transport type.', field));
            }
        }
    }

    protected requiredEntryString(entry: Record<string, unknown>, field: string): string {
        if (entry[field] === undefined) {
            throw this.entryInvalid(nls.localize('theia/ai-registry/plugin/serverMissingField',
                'The server configuration is missing the required "{0}" field.', field));
        }
        const value = this.entryString(entry, field);
        if (!value) {
            throw this.entryInvalid(nls.localize('theia/ai-registry/plugin/serverEmptyField',
                'The server configuration field "{0}" must not be empty.', field));
        }
        return value;
    }

    protected entryString(entry: Record<string, unknown>, field: string): string {
        const value = entry[field];
        if (typeof value !== 'string') {
            throw this.entryInvalid(nls.localize('theia/ai-registry/plugin/serverFieldNotString',
                'The server configuration field "{0}" must be a string.', field));
        }
        return value;
    }

    protected requiredString(manifest: Record<string, unknown>, field: string): string {
        const value = manifest[field];
        if (typeof value !== 'string' || value.length === 0) {
            throw new AgentPluginRejectedError(nls.localize('theia/ai-registry/plugin/manifestRequiredField',
                'The "plugin.json" field "{0}" is required and must be a non-empty string.', field));
        }
        return value;
    }

    protected optionalString(manifest: Record<string, unknown>, field: string): string | undefined {
        const value = manifest[field];
        if (value === undefined) {
            return undefined;
        }
        if (typeof value !== 'string') {
            throw new AgentPluginRejectedError(nls.localize('theia/ai-registry/plugin/manifestFieldNotString',
                'The "plugin.json" field "{0}" must be a string.', field));
        }
        return value;
    }

    protected authorName(manifest: Record<string, unknown>): string | undefined {
        const author = manifest.author;
        if (author === undefined) {
            return undefined;
        }
        if (!this.isRecord(author) || Object.keys(author).some(field => !AUTHOR_FIELDS.includes(field))
            || Object.values(author).some(value => typeof value !== 'string')) {
            throw new AgentPluginRejectedError(nls.localize('theia/ai-registry/plugin/manifestInvalidAuthor',
                'The "plugin.json" field "author" must be an object with the optional string fields "name", "email" and "url".'));
        }
        return typeof author.name === 'string' ? author.name : undefined;
    }

    protected keywords(manifest: Record<string, unknown>): string[] | undefined {
        const keywords = manifest.keywords;
        if (keywords === undefined) {
            return undefined;
        }
        if (!Array.isArray(keywords) || keywords.some(keyword => typeof keyword !== 'string')) {
            throw new AgentPluginRejectedError(nls.localize('theia/ai-registry/plugin/manifestInvalidKeywords',
                'The "plugin.json" field "keywords" must be an array of strings.'));
        }
        return keywords as string[];
    }

    protected parseJson(text: string): unknown {
        return JSON.parse(text);
    }

    protected mcpDisabled(reason: string): ResolvedPluginComponents {
        return { servers: [], skipped: [], mcpDisabledReason: reason };
    }

    protected entryInvalid(reason: string): ServerEntryInvalid {
        return new ServerEntryInvalid(reason);
    }

    protected skipReason(error: unknown): string {
        return error instanceof Error && error.message
            ? error.message
            : nls.localize('theia/ai-registry/plugin/serverInvalid', 'The server configuration is invalid.');
    }

    /**
     * A UNC root keeps its leading `//`: `Path.normalize` drops empty segments, folding
     * `\\server\share\x` to `/server/share/x` - a different location, and one that would then
     * disagree with the `PLUGIN_ROOT` the backend derives with Node's `path.join`.
     */
    protected normalizePath(path: string): string {
        const unc = /^[/\\]{2}[^/\\]/.test(path);
        const normalized = new Path(path).normalize().toString();
        const trimmed = normalized.length > 1 && normalized.endsWith(Path.separator) ? normalized.slice(0, -1) : normalized;
        return unc && !trimmed.startsWith('//') ? `/${trimmed}` : trimmed;
    }

    /** A no-op on POSIX; on Windows it turns `/c:/plugins/acme` back into `c:\plugins\acme`. */
    protected toNativePath(path: string): string {
        return new Path(path).fsPath(this.nativePathFormat());
    }

    /**
     * Its own seam so a test can pin the format without replacing the conversion it is exercising:
     * tests run on POSIX, where an overridden {@link toNativePath} would prove nothing about the real
     * one. `undefined` means "whatever the backend runs on".
     */
    protected nativePathFormat(): Path.Format | undefined {
        return undefined;
    }

    protected isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && !!value && !Array.isArray(value);
    }
}
