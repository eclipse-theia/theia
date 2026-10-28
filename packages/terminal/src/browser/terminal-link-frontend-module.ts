// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses as the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { bindRootContributionProvider } from '@theia/core';
import { TerminalContribution } from './terminal-contribution';
import { createXtermLinkFactory, TerminalLinkProvider, TerminalLinkProviderContribution, XtermLinkFactory } from './terminal-link-provider';
import { UrlLinkProvider } from './terminal-url-link-provider';
import { FileDiffPostLinkProvider, FileDiffPreLinkProvider, FileLinkProvider, LocalFileLinkProvider } from './terminal-file-link-provider';
import { FileUriLinkProvider } from './terminal-file-uri-link-provider';

/**
 * Bindings for the terminal link providers, split off from
 * `terminal-frontend-module`: the providers hold runtime references to
 * `TerminalWidgetImpl` and pull in the xterm stack, so they are loaded
 * dynamically by the widget factory on first terminal creation instead of
 * at application startup.
 */
export default new ContainerModule(bind => {
    bindRootContributionProvider(bind, TerminalLinkProvider);
    bind(TerminalLinkProviderContribution).toSelf().inSingletonScope();
    bind(TerminalContribution).toService(TerminalLinkProviderContribution);
    bind(XtermLinkFactory).toFactory(createXtermLinkFactory);

    // default terminal link provider
    bind(UrlLinkProvider).toSelf().inSingletonScope();
    bind(TerminalLinkProvider).toService(UrlLinkProvider);
    bind(FileUriLinkProvider).toSelf().inSingletonScope();
    bind(TerminalLinkProvider).toService(FileUriLinkProvider);
    bind(FileLinkProvider).toSelf().inSingletonScope();
    bind(TerminalLinkProvider).toService(FileLinkProvider);
    bind(FileDiffPreLinkProvider).toSelf().inSingletonScope();
    bind(TerminalLinkProvider).toService(FileDiffPreLinkProvider);
    bind(FileDiffPostLinkProvider).toSelf().inSingletonScope();
    bind(TerminalLinkProvider).toService(FileDiffPostLinkProvider);
    bind(LocalFileLinkProvider).toSelf().inSingletonScope();
    bind(TerminalLinkProvider).toService(LocalFileLinkProvider);
});
