// *****************************************************************************
// Copyright (C) 2025 TypeFox and others.
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

import { injectable } from 'inversify';
import { ColorContribution } from './color-application-contribution';
import { ColorRegistry } from './color-registry';

@injectable()
export class SymbolIconColorContribution implements ColorContribution {
    registerColors(colors: ColorRegistry): void {
        colors.register(
            {
                id: 'symbolIcon.arrayForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for array symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.booleanForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for boolean symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.classForeground',
                defaults: {
                    dark: '#EE9D28',
                    light: '#D67E00',
                    hcDark: '#EE9D28',
                    hcLight: '#D67E00'
                },
                description: 'The foreground color for class symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.colorForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for color symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.constantForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for constant symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.constructorForeground',
                defaults: {
                    dark: '#B180D7',
                    light: '#652D90',
                    hcDark: '#B180D7',
                    hcLight: '#652D90'
                },
                description: 'The foreground color for constructor symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.enumeratorForeground',
                defaults: {
                    dark: '#EE9D28',
                    light: '#D67E00',
                    hcDark: '#EE9D28',
                    hcLight: '#D67E00'
                },
                description: 'The foreground color for enumerator symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.enumeratorMemberForeground',
                defaults: {
                    dark: '#75BEFF',
                    light: '#007ACC',
                    hcDark: '#75BEFF',
                    hcLight: '#007ACC'
                },
                description: 'The foreground color for enumerator member symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.eventForeground',
                defaults: {
                    dark: '#EE9D28',
                    light: '#D67E00',
                    hcDark: '#EE9D28',
                    hcLight: '#D67E00'
                },
                description: 'The foreground color for event symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.fieldForeground',
                defaults: {
                    dark: '#75BEFF',
                    light: '#007ACC',
                    hcDark: '#75BEFF',
                    hcLight: '#007ACC'
                },
                description: 'The foreground color for field symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.fileForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for file symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.folderForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for folder symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.functionForeground',
                defaults: {
                    dark: '#B180D7',
                    light: '#652D90',
                    hcDark: '#B180D7',
                    hcLight: '#652D90'
                },
                description: 'The foreground color for function symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.interfaceForeground',
                defaults: {
                    dark: '#75BEFF',
                    light: '#007ACC',
                    hcDark: '#75BEFF',
                    hcLight: '#007ACC'
                },
                description: 'The foreground color for interface symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.keyForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for key symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.keywordForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for keyword symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.methodForeground',
                defaults: {
                    dark: '#B180D7',
                    light: '#652D90',
                    hcDark: '#B180D7',
                    hcLight: '#652D90'
                },
                description: 'The foreground color for method symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.moduleForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for module symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.namespaceForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for namespace symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.nullForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for null symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.numberForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for number symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.objectForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for object symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.operatorForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for operator symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.packageForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for package symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.propertyForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for property symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.referenceForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for reference symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.snippetForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for snippet symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.stringForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for string symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.structForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for struct symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.textForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for text symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.typeParameterForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for type parameter symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.unitForeground',
                defaults: 'editor.foreground',
                description: 'The foreground color for unit symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            },
            {
                id: 'symbolIcon.variableForeground',
                defaults: {
                    dark: '#75BEFF',
                    light: '#007ACC',
                    hcDark: '#75BEFF',
                    hcLight: '#007ACC'
                },
                description: 'The foreground color for variable symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'
            }
        );
    }
}
