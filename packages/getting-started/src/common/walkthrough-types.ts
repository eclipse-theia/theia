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

export interface WalkthroughStep {
    id: string;
    title: string;
    description: string;
    media?: { markdown: string } | { image: string | { dark: string; light: string; hc: string; hcLight: string }; altText?: string } | { svg: string };
    completionEvents?: string[];
    when?: string;
    isComplete: boolean;
}

export interface Walkthrough {
    id: string;
    title: string;
    description: string;
    steps: WalkthroughStep[];
    featuredFor?: string[];
    when?: string;
    icon?: string;
    pluginId: string;
    extensionUri: string;
}
