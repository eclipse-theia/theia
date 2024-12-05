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
        'packagePath': '/Users/robertjandow/Documents/Development/theia/plugins/demo-plugin', // Deprecated
        'packageUri': 'file:///Users/robertjandow/Documents/Development/theia/plugins/demo-plugin',
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
        'backendInitPath': '/Users/robertjandow/Documents/Development/theia/examples/browser/lib/backend/backend-init-theia'
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
  {
    metadata: {
      host: 'main',
      'model': {
        'packagePath': '/Users/robertjandow/Documents/Development/theia/plugins/vscode.simple-browser/extension', // Deprecated
        'packageUri': 'file:///Users/robertjandow/Documents/Development/theia/plugins/vscode.simple-browser/extension',
        'id': 'vscode.simple-browser',
        'name': 'simple-browser',
        'publisher': 'vscode',
        'version': '1.88.1',
        'displayName': 'vscode.simple-browser',
        'description': '',
        'engine': {
          'type': 'vscode',
          'version': '^1.70.0'
        },
        'entryPoint': {
          'frontend': 'dist/browser/extension.js'
        }
      },
      'lifecycle': {
        'startMethod': 'start',
        'stopMethod': 'stop',
        'frontendModuleName': 'vscode_simple_browser',
        'backendInitPath': '/Users/robertjandow/Documents/Development/theia/examples/browser/lib/backend/plugin-vscode-init'
      },
      'outOfSync': false,
      'isUnderDevelopment': false
    },
    'type': 0,
    "contributes": {
      "activationEvents": [
        "*"
      ],
      "commands": [
        {
          "command": "simpleBrowser.show",
          "title": "Show",
          "category": "Simple Browser"
        }
      ],
      "configuration": [
        {
          "title": "Simple Browser",
          "properties": {
            "simpleBrowser.focusLockIndicator.enabled": {
              "type": "boolean",
              "default": true,
              "title": "Focus Lock Indicator Enabled",
              "description": "%configuration.focusLockIndicator.enabled.description%"
            }
          }
        }
      ]
    },
  },
];
