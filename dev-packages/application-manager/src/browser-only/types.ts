// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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

/**
 * Mirrors `PluginModel`, `PluginMetadata`, `DeployedPlugin`, etc. in
 * `packages/plugin-ext/src/common/plugin-protocol.ts` so `list.json` stays compatible
 * without dev-packages depending on `packages/`.
 */

/** Same as `PLUGIN_HOST_BACKEND` / main host in plugin-protocol. */
export const PLUGIN_HOST_BACKEND = 'main' as const;

/**
 * Mirrors `PluginType` in `packages/plugin-ext/src/common/plugin-protocol.ts`
 * (serialized numeric `type` field in `list.json`).
 * Keep member order and values aligned with that enum when it changes.
 */
export enum BrowserOnlyPluginType {
    System = 0,
    User = 1
}

/**
 * `capabilities` on a VS Code extension manifest (`package.json`).
 * Must stay in sync with `PluginPackage.capabilities` in
 * `packages/plugin-ext/src/common/plugin-protocol.ts` — that is the source of truth Theia uses;
 * only `untrustedWorkspaces` is modeled there today.
 *
 * @see https://code.visualstudio.com/api/references/extension-manifest
 */
export interface PluginPackageCapabilities {
    untrustedWorkspaces?: {
        supported: boolean | 'limited';
        description?: string;
        restrictedConfigurations?: string[];
    };
}

/**
 * Subset of `PluginPackage` / VS Code extension `package.json` fields this build reads from disk
 */
export interface BrowserOnlyManifest {
    name: string;
    version: string;
    publisher?: string;
    displayName?: string;
    description?: string;
    l10n?: string;
    engines?: Record<string, string>;
    theiaPlugin?: { frontend?: string; backend?: string; headless?: string };
    main?: string;
    browser?: string;
    contributes?: Record<string, unknown>;
    activationEvents?: string[];
    extensionDependencies?: string[];
    extensionPack?: string[];
    extensionKind?: Array<'ui' | 'workspace'>;
    icon?: string;
    capabilities?: PluginPackageCapabilities;
    packageUri: string;
    packagePath: string;
}

export interface PluginEntryPoint {
    frontend?: string;
    backend?: string;
    headless?: string;
}

export interface BrowserOnlyPluginModel {
    id: string;
    name: string;
    publisher: string;
    version: string;
    displayName: string;
    description: string;
    engine: { type: string; version: string };
    entryPoint: PluginEntryPoint;
    packageUri: string;
    /** @deprecated in protocol — kept for compatibility with hosted plugin consumer. */
    packagePath: string;
    iconUrl?: string;
    l10n?: string;
    readmeUrl?: string;
    licenseUrl?: string;
    untrustedWorkspacesSupport?: boolean | 'limited';
}

export interface BrowserOnlyPluginLifecycle {
    startMethod: string;
    stopMethod: string;
    frontendModuleName?: string;
    frontendInitPath?: string;
    backendInitPath?: string;
}

export interface BrowserOnlyPluginMetadata {
    host: typeof PLUGIN_HOST_BACKEND;
    model: BrowserOnlyPluginModel;
    lifecycle: BrowserOnlyPluginLifecycle;
    outOfSync: boolean;
}

/**
 * Static contributions written to `list.json`, same role as `PluginContribution` in
 * `packages/plugin-ext/src/common/plugin-protocol.ts`.
 *
 * Extra contribution keys from extensions use the index signature.
 *
 * @see PluginContribution — align top-level property names when protocol adds new ones.
 */
export interface BrowserOnlyPluginContribution {
    activationEvents?: string[];
    authentication?: unknown[];
    configuration?: unknown[];
    configurationDefaults?: Record<string, unknown>;
    languages?: unknown[];
    grammars?: unknown[];
    customEditors?: unknown[];
    viewsContainers?: Record<string, unknown[]>;
    views?: Record<string, unknown[]>;
    viewsWelcome?: unknown[];
    commands?: unknown[];
    menus?: Record<string, unknown[]>;
    submenus?: unknown[];
    keybindings?: unknown[];
    debuggers?: unknown[];
    snippets?: unknown[];
    themes?: unknown[];
    iconThemes?: unknown[];
    icons?: unknown[];
    colors?: unknown[];
    taskDefinitions?: unknown[];
    problemMatchers?: unknown[];
    problemPatterns?: unknown[];
    resourceLabelFormatters?: unknown[];
    localizations?: unknown[];
    terminalProfiles?: unknown[];
    notebooks?: unknown[];
    notebookRenderer?: unknown[];
    notebookPreload?: unknown[];
    [key: string]: unknown;
}

export interface BrowserOnlyDeployedPlugin {
    type: BrowserOnlyPluginType;
    metadata: BrowserOnlyPluginMetadata;
    contributes?: BrowserOnlyPluginContribution;
}
