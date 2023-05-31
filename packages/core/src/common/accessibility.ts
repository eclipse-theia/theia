// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
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
 * Accessibility information which controls screen reader behavior.
 */
export interface AccessibilityInformation {
    /**
     * Label to be read out by a screen reader once the item has focus.
     */
    readonly label: string;

    /**
     * Role of the widget which defines how a screen reader interacts with it.
     * The role should be set in special cases when for example a tree-like element behaves like a checkbox.
     * If role is not specified the editor will pick the appropriate role automatically.
     * More about aria roles can be found here https://w3c.github.io/aria/#widget_roles
     */
    readonly role?: string;
}
