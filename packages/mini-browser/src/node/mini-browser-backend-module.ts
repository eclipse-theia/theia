/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { ContainerModule } from '@theia/core/shared/inversify';
import { bindContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core/lib/common';
import { MiniBrowserService, MiniBrowserServicePath } from '../common/mini-browser-service';
import { MiniBrowserEndpoint, MiniBrowserEndpointHandler, HtmlHandler, ImageHandler, PdfHandler, SvgHandler } from './mini-browser-endpoint';
import { WsRequestValidatorContribution } from '@theia/core/lib/node/ws-request-validators';
import { MiniBrowserWsRequestValidator } from './mini-browser-ws-validator';

export default new ContainerModule(bind => {
    bind(MiniBrowserEndpoint).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(MiniBrowserEndpoint);
    bind(MiniBrowserWsRequestValidator).toSelf().inSingletonScope();
    bind(WsRequestValidatorContribution).toService(MiniBrowserWsRequestValidator);
    bind(MiniBrowserService).toService(MiniBrowserEndpoint);
    bind(ConnectionHandler).toDynamicValue(context => new JsonRpcConnectionHandler(MiniBrowserServicePath, () => context.container.get(MiniBrowserService))).inSingletonScope();
    bindContributionProvider(bind, MiniBrowserEndpointHandler);
    bind(MiniBrowserEndpointHandler).to(HtmlHandler).inSingletonScope();
    bind(MiniBrowserEndpointHandler).to(ImageHandler).inSingletonScope();
    bind(MiniBrowserEndpointHandler).to(PdfHandler).inSingletonScope();
    bind(MiniBrowserEndpointHandler).to(SvgHandler).inSingletonScope();
});
