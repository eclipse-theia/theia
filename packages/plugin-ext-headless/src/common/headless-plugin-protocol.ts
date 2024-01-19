// *****************************************************************************
// Copyright (C) 2024 EclipseSource and others.
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

export * from '@theia/plugin-ext';

declare module '@theia/plugin-ext' {
  /**
   * Extension of the package manifest interface defined by the core plugin framework.
   */
  interface PluginPackage {
      /**
       * Analogues of declarations offered by VS Code plugins, but for the headless instantiation.
       */
      headless?: {
          /** Activation events supported in headless mode, if any. */
          activationEvents?: string[];
      }
  }
}

/**
 * Name for a `string[]` injection binding contributing headless activation event names
 * supported by the application.
 */
export const SupportedHeadlessActivationEvents = Symbol('SupportedHeadlessActivationEvents');
