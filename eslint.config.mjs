// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import buildConfig from './configs/build.eslint.mjs';

/** @type {import('eslint').Linter.Config[]} */
export default [
    {
        ignores: [
            '**/node_modules/**',
            '**/lib/**',
            '**/src-gen/**',
            'plugins/**',
            'examples/api-tests/**',
            'sample-plugins/**',
            'examples/playwright/configs/playwright.config.ts'
        ]
    },
    ...buildConfig,
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            }
        }
    },
    {
        files: [
            'dev-packages/application-manager/**',
            'dev-packages/cli/**',
            'dev-packages/localization-manager/**'
        ],
        rules: {
            'import/no-dynamic-require': 'off'
        }
    },
    {
        files: [
            'packages/plugin-ext/**',
            'packages/plugin-ext-headless/**'
        ],
        rules: {
            'no-null/no-null': 'off'
        }
    },
    {
        files: ['packages/plugin/**'],
        rules: {
            '@typescript-eslint/no-shadow': 'off'
        }
    },
    {
        files: ['examples/playwright/**/*.ts'],
        languageOptions: {
            parserOptions: {
                warnOnUnsupportedTypeScriptVersion: false
            }
        },
        rules: {
            'no-null/no-null': 'off',
            'no-undef': 'off',
            'no-unused-expressions': 'off'
        }
    }
];
