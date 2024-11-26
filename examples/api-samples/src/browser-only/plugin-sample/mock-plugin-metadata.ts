// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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
// ****************************************************************************

export const mockData: any[] = [
  {
    metadata: {
      host: 'main',
      'model': {
        'packagePath': '/theia/plugins/demo-plugin', // Deprecated
        'packageUri': 'file:///theia/plugins/demo-plugin', // TODO Path to the plugin
        'id': 'theia.demo-plugin',
        'name': 'demo-plugin',
        'publisher': 'theia',
        'version': '0.0.1',
        'displayName': 'theia.demo-plugin',
        'description': '',
        'engine': {
          'type': 'theiaPlugin',
          'version': 'next'
        },
        'entryPoint': {
          'frontend': 'dist/demo-plugin-frontend.js'
        }
      },
      'lifecycle': {
        'startMethod': 'start',
        'stopMethod': 'stop',
        'frontendModuleName': 'theia_demo_plugin',
        'backendInitPath': '/theia/examples/browser/lib/backend/backend-init-theia' // TODO Path to the backend initialization file
      },
      'outOfSync': false,
      'isUnderDevelopment': false
    },
    'type': 0,
    'contributes': {
      'activationEvents': [
        '*'
      ]
    }
  },
];
