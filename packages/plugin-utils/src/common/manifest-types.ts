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

import { isObject } from './utils';
import type { NormalizedPluginContribution, PluginManifestContribution } from './contribution-types';

export const PLUGIN_HOST_BACKEND = 'main' as const;

/** Whether a plugin is installed by the system or by a user. */
export enum PluginType {
    System = 0,
    User = 1
}

/** Same shape as `PluginPackage.capabilities` in `plugin-protocol.ts`. */
export interface PluginPackageCapabilities {
    untrustedWorkspaces?: {
        supported: boolean | 'limited';
        description?: string;
        restrictedConfigurations?: string[];
    };
}

/**
 * VS Code / Theia extension `package.json` manifest.
 */
export interface PluginManifest {
    name: string;
    version: string;
    publisher?: string;
    displayName?: string;
    description?: string;
    l10n?: string;
    packagePath: string;
    packageUri?: string;
    engines?: Record<string, string>;
    theiaPlugin?: { frontend?: string; backend?: string; headless?: string };
    main?: string;
    browser?: string;
    extensionKind?: Array<'ui' | 'workspace'>;
    icon?: string;
    type?: 'module' | 'commonjs';
    extensionDependencies?: string[];
    extensionPack?: string[];
    capabilities?: PluginPackageCapabilities;
    /** Raw `contributes` section from `package.json` before normalization. */
    contributes?: PluginManifestContribution;
    activationEvents?: string[];
}

export function rawContributes(manifest: Pick<PluginManifest, 'contributes'>): PluginManifestContribution {
    return isObject(manifest.contributes) ? manifest.contributes as PluginManifestContribution : {};
}

export interface PluginEntryPoint {
    frontend?: string;
    backend?: string;
    headless?: string;
}

/** Plugin model populated from `package.json`. */
export interface PluginModel {
    id: string;
    name: string;
    publisher: string;
    version: string;
    displayName: string;
    description: string;
    engine: { type: string; version: string };
    entryPoint: PluginEntryPoint;
    packageUri: string;
    /**
     * @deprecated since 1.1.0 - because it lead to problems with getting a relative path
     * needed by Icon Themes to correctly load Fonts, use packageUri instead.
     */
    packagePath: string;
    iconUrl?: string;
    l10n?: string;
    readmeUrl?: string;
    licenseUrl?: string;
    untrustedWorkspacesSupport?: boolean | 'limited';
}

export interface PluginLifecycle {
    startMethod: string;
    stopMethod: string;
    /** Frontend module name; the frontend plugin should expose this name. */
    frontendModuleName?: string;
    /** Script run before the frontend plugin is loaded. */
    frontendInitPath?: string;
    /** Script run before the backend plugin is loaded. */
    backendInitPath?: string;
}

export interface PluginMetadata {
    /** Plugin host id used for RPC routing (e.g. {@link PLUGIN_HOST_BACKEND}). */
    host: string;
    model: PluginModel;
    lifecycle: PluginLifecycle;
    outOfSync: boolean;
    /** Set when the plugin is loaded from a development workspace (e.g. plugin-dev). */
    isUnderDevelopment?: boolean;
}

/**
 * Deployed plugin descriptor (runtime + browser-only `list.json`).
 */
export interface DeployedPlugin<TContributes = NormalizedPluginContribution> {
    /** Defaults to {@link PluginType.System}. */
    type?: PluginType;
    metadata: PluginMetadata;
    contributes?: TContributes;
}
