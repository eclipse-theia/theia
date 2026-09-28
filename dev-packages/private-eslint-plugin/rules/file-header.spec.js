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

const { RuleTester } = require('eslint');
const rule = require('./file-header');

const match = 'SPDX-License-Identifier: EPL-2\\.0 OR GPL-2\\.0-only WITH Classpath-exception-2\\.0';
const options = [{ match }];
const error = {
    message: `missing or invalid license file header (expected to match "${match}")`
};

const ruleTester = new RuleTester({
    parserOptions: { ecmaVersion: 2020, sourceType: 'module' }
});

ruleTester.run('@theia/file-header', rule, {
    valid: [
        {
            code: `
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
const value = true;
`,
            options
        },
        {
            code: `
/*
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 */
const value = true;
`,
            options
        },
        {
            code: `
        // @ts-check
        // SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
        const value = true;
        `,
            options
        },
        {
            code: `/* eslint-disable @theia/file-header */
        // SPDX-License-Identifier: MIT
        const value = true;
        `,
            options
        },
        {
            code: `/* eslint-disable */
        // SPDX-License-Identifier: MIT
        const value = true;
        `,
            options
        },
        {
            code: '// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0',
            options
        }
    ],
    invalid: [
        {
            code: 'const value = true;',
            options,
            errors: [error]
        },
        {
            code: `
        // SPDX-License-Identifier: MIT
        const value = true;
        `,
            options,
            errors: [error]
        },
        {
            code: `/* eslint-disable eqeqeq */
        // SPDX-License-Identifier: MIT
        const value = true;
        `,
            options,
            errors: [error]
        },
        {
            code: `// SPDX-License-Identifier: MIT
        /* eslint-disable @theia/file-header */
        const value = true;
        `,
            options,
            errors: [error]
        },
        {
            code: `
const value = true;
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
`,
            options,
            errors: [error]
        }
    ]
});
