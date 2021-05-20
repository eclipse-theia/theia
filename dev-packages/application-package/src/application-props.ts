/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import type { BrowserWindowConstructorOptions } from 'electron';

/**
 * Base configuration for the Theia application.
 */
export interface ApplicationConfig {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly [key: string]: any;
}

/**
 * Helper interface that generates two versions of an interface given two inputs:
 * @param WithDefault key/values that may be left undefined but will be resolved to a default when missing.
 * @param Rest key/values that may or may not be left undefined but will stay that way.
 * @returns a pseudo-interface you can query 'resolved' or 'partial' to get different versions of the same interface.
 */
interface ConfigHelper<WithDefault extends object, Rest extends object> {
    /** Query this field like `Config['partial']` to get the type with optional fields. */
    partial: Partial<WithDefault> & Rest & ApplicationConfig
    /** Query this field like `Config['resolved']` to get the type without undefined values for fields with defaults. */
    resolved: Required<WithDefault> & Rest & ApplicationConfig
}

export interface NpmRegistryProps {

    /**
     * Defaults to `false`.
     */
    readonly next: boolean;

    /**
     * Defaults to `https://registry.npmjs.org/`.
     */
    readonly registry: string;

}
export namespace NpmRegistryProps {
    export const DEFAULT: NpmRegistryProps = {
        next: false,
        registry: 'https://registry.npmjs.org/'
    };
}

/**
 * Application configuration for the frontend. The following properties will be injected into the `index.html`.
 */
export type FrontendApplicationConfig = _FrontendApplicationConfig['resolved'];
type _FrontendApplicationConfig = ConfigHelper<{
    /**
     * The default theme for the application. If not given, defaults to `dark`. If invalid theme is given, also defaults to `dark`.
     */
    readonly defaultTheme: string;

    /**
     * The default icon theme for the application. If not given, defaults to `none`. If invalid theme is given, also defaults to `none`.
     */
    readonly defaultIconTheme: string;

    /**
     * The name of the application. `Eclipse Theia` by default.
     */
    readonly applicationName: string;
}, {
    /**
     * Electron specific configuration.
     */
    readonly electron?: Readonly<ElectronFrontendApplicationConfig>;
}>;
export namespace FrontendApplicationConfig {
    export const DEFAULT: FrontendApplicationConfig = {
        applicationName: 'Eclipse Theia',
        defaultTheme: 'dark',
        defaultIconTheme: 'none'
    };
    export type Partial = _FrontendApplicationConfig['partial'];
}

export type ElectronFrontendApplicationConfig = _ElectronFrontendApplicationConfig['resolved'];
type _ElectronFrontendApplicationConfig = ConfigHelper<{
    /**
     * If set to `true`, reloading the current browser window won't be possible with the `Ctrl/Cmd + R` keybinding.
     * It is `false` by default. Has no effect if not in an electron environment.
     */
    readonly disallowReloadKeybinding: boolean;
}, {
    /**
     * Override or add properties to the electron `windowOptions`.
     */
    readonly windowOptions?: BrowserWindowConstructorOptions;
}>;
export namespace ElectronFrontendApplicationConfig {
    export const DEFAULT: ElectronFrontendApplicationConfig = {
        disallowReloadKeybinding: false,
    };
    export type Partial = _ElectronFrontendApplicationConfig['partial'];
}

/**
 * Application configuration for the backend.
 */
export type BackendApplicationConfig = _BackendApplicationConfig['resolved'];
type _BackendApplicationConfig = ConfigHelper<{}, {
    /**
     * If true and in Electron mode, only one instance of the application is allowed to run at a time.
     */
    readonly singleInstance?: boolean;
}>;
export namespace BackendApplicationConfig {
    export const DEFAULT: BackendApplicationConfig = {};
    export type Partial = _BackendApplicationConfig['partial'];
}

/**
 * Configuration for the generator.
 */
export type GeneratorConfig = _GeneratorConfig['resolved'];
type _GeneratorConfig = ConfigHelper<{
    /**
     * Template to use for extra preload content markup (file path or HTML). Defaults to `''`.
     */
    readonly preloadTemplate: string;
}, {}>;
export namespace GeneratorConfig {
    export const DEFAULT: GeneratorConfig = {
        preloadTemplate: ''
    };
    export type Partial = _GeneratorConfig['partial'];
}

/**
 * Representation of all backend and frontend related Theia extension and application properties.
 */
export interface ApplicationProps extends NpmRegistryProps {

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly [key: string]: any;

    /**
     * Whether the extension targets the browser or electron. Defaults to `browser`.
     */
    readonly target: ApplicationProps.Target;

    /**
     * Frontend related properties.
     */
    readonly frontend: Readonly<{ config: FrontendApplicationConfig }>;

    /**
     * Backend specific properties.
     */
    readonly backend: Readonly<{ config: BackendApplicationConfig }>;

    /**
     * Generator specific properties.
     */
    readonly generator: Readonly<{ config: GeneratorConfig }>;
}
export namespace ApplicationProps {
    export enum ApplicationTarget {
        browser = 'browser',
        electron = 'electron'
    };
    export type Target = keyof typeof ApplicationTarget;
    export const DEFAULT: ApplicationProps = {
        ...NpmRegistryProps.DEFAULT,
        target: 'browser',
        backend: {
            config: BackendApplicationConfig.DEFAULT,
        },
        frontend: {
            config: FrontendApplicationConfig.DEFAULT,
        },
        generator: {
            config: GeneratorConfig.DEFAULT,
        }
    };
}
