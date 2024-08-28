// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import type { BrowserWindowConstructorOptions } from 'electron';
export import deepmerge = require('deepmerge');

export type RequiredRecursive<T> = {
    [K in keyof T]-?: T[K] extends object ? RequiredRecursive<T[K]> : T[K]
};

/**
 * Base configuration for the Theia application.
 */
export interface ApplicationConfig {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly [key: string]: any;
}

export type ElectronFrontendApplicationConfig = RequiredRecursive<ElectronFrontendApplicationConfig.Partial>;
export namespace ElectronFrontendApplicationConfig {
    export const DEFAULT: ElectronFrontendApplicationConfig = {
        windowOptions: {},
        showWindowEarly: true,
        splashScreenOptions: {},
        uriScheme: 'theia'
    };
    export interface SplashScreenOptions {
        /**
         * Initial width of the splash screen. Defaults to 640.
         */
        width?: number;
        /**
         * Initial height of the splash screen. Defaults to 480.
         */
        height?: number;
        /**
         * Minimum amount of time in milliseconds to show the splash screen before main window is shown.
         * Defaults to 0, i.e. the splash screen will be shown until the frontend application is ready.
         */
        minDuration?: number;
        /**
         * Maximum amount of time in milliseconds before splash screen is removed and main window is shown.
         * Defaults to 30000.
         */
        maxDuration?: number;
        /**
         * The content to load in the splash screen.
         * Will be resolved from application root.
         *
         * Mandatory attribute.
         */
        content?: string;
    }
    export interface Partial {

        /**
         * Override or add properties to the electron `windowOptions`.
         *
         * Defaults to `{}`.
         */
        readonly windowOptions?: BrowserWindowConstructorOptions;

        /**
         * Whether or not to show an empty Electron window as early as possible.
         *
         * Defaults to `true`.
         */
        readonly showWindowEarly?: boolean;

        /**
         * Configuration options for splash screen.
         *
         * Defaults to `{}` which results in no splash screen being displayed.
         */
        readonly splashScreenOptions?: SplashScreenOptions;

        /**
         * The custom uri scheme the application registers to in the operating system.
         */
        readonly uriScheme: string;
    }
}

export type DefaultTheme = string | Readonly<{ light: string, dark: string }>;
export namespace DefaultTheme {
    export function defaultForOSTheme(theme: DefaultTheme): string {
        if (typeof theme === 'string') {
            return theme;
        }
        if (
            typeof window !== 'undefined' &&
            window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: dark)').matches
        ) {
            return theme.dark;
        }
        return theme.light;
    }
    export function defaultBackgroundColor(dark?: boolean): string {
        // The default light background color is based on the `colors#editor.background` value from
        // `packages/monaco/data/monaco-themes/vscode/dark_vs.json` and the dark background comes from the `light_vs.json`.
        return dark ? '#1E1E1E' : '#FFFFFF';
    }
}

/**
 * Application configuration for the frontend. The following properties will be injected into the `index.html`.
 */
export type FrontendApplicationConfig = RequiredRecursive<FrontendApplicationConfig.Partial>;
export namespace FrontendApplicationConfig {
    export const DEFAULT: FrontendApplicationConfig = {
        applicationName: 'Eclipse Theia',
        defaultTheme: { light: 'light', dark: 'dark' },
        defaultIconTheme: 'theia-file-icons',
        electron: ElectronFrontendApplicationConfig.DEFAULT,
        defaultLocale: '',
        validatePreferencesSchema: true,
        reloadOnReconnect: false,
        uriScheme: 'theia'
    };
    export interface Partial extends ApplicationConfig {

        /**
         * The default theme for the application.
         *
         * Defaults to `dark` if the OS's theme is dark. Otherwise `light`.
         */
        readonly defaultTheme?: DefaultTheme;

        /**
         * The default icon theme for the application.
         *
         * Defaults to `none`.
         */
        readonly defaultIconTheme?: string;

        /**
         * The name of the application.
         *
         * Defaults to `Eclipse Theia`.
         */
        readonly applicationName?: string;

        /**
         * Electron specific configuration.
         *
         * Defaults to `ElectronFrontendApplicationConfig.DEFAULT`.
         */
        readonly electron?: ElectronFrontendApplicationConfig.Partial;

        /**
         * The default locale for the application.
         *
         * Defaults to "".
         */
        readonly defaultLocale?: string;

        /**
         * When `true`, the application will validate the JSON schema of the preferences on start
         * and log warnings to the console if the schema is not valid.
         *
         * Defaults to `true`.
         */
        readonly validatePreferencesSchema?: boolean;

        /**
         * When 'true', the window will reload in case the front end reconnects to a back-end,
         * but the back end does not have a connection context for this front end anymore.
         */
        readonly reloadOnReconnect?: boolean;
    }
}

/**
 * Application configuration for the backend.
 */
export type BackendApplicationConfig = RequiredRecursive<BackendApplicationConfig.Partial>;
export namespace BackendApplicationConfig {
    export const DEFAULT: BackendApplicationConfig = {
        singleInstance: true,
        frontendConnectionTimeout: 0
    };
    export interface Partial extends ApplicationConfig {

        /**
         * If true and in Electron mode, only one instance of the application is allowed to run at a time.
         *
         * Defaults to `false`.
         */
        readonly singleInstance?: boolean;

        /**
         * The time in ms the connection context will be preserved for reconnection after a front end disconnects.
         */
        readonly frontendConnectionTimeout?: number;
    }
}

/**
 * Configuration for the generator.
 */
export type GeneratorConfig = RequiredRecursive<GeneratorConfig.Partial>;
export namespace GeneratorConfig {
    export const DEFAULT: GeneratorConfig = {
        preloadTemplate: ''
    };
    export interface Partial {

        /**
         * Template to use for extra preload content markup (file path or HTML).
         *
         * Defaults to `''`.
         */
        readonly preloadTemplate?: string;
    }
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
    readonly frontend: {
        readonly config: FrontendApplicationConfig
    };

    /**
     * Backend specific properties.
     */
    readonly backend: {
        readonly config: BackendApplicationConfig
    };

    /**
     * Generator specific properties.
     */
    readonly generator: {
        readonly config: GeneratorConfig
    };
}
export namespace ApplicationProps {
    export type Target = `${ApplicationTarget}`;
    export enum ApplicationTarget {
        browser = 'browser',
        electron = 'electron',
        browserOnly = 'browser-only'
    };
    export const DEFAULT: ApplicationProps = {
        ...NpmRegistryProps.DEFAULT,
        target: 'browser',
        backend: {
            config: BackendApplicationConfig.DEFAULT
        },
        frontend: {
            config: FrontendApplicationConfig.DEFAULT
        },
        generator: {
            config: GeneratorConfig.DEFAULT
        }
    };

}
