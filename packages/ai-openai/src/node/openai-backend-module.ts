// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { Container, ContainerModule } from '@theia/core/shared/inversify';
import { OPENAI_LANGUAGE_MODELS_MANAGER_PATH, OpenAiLanguageModelsManager } from '../common/openai-language-models-manager';
import { ConnectionHandler, PreferenceContribution, RpcConnectionHandler } from '@theia/core';
import { OpenAiLanguageModelsManagerImpl } from './openai-language-models-manager-impl';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { OpenAiLanguageModelFactory, OpenAiModel, OpenAiModelParams } from './openai-language-model';
import { OpenAiModelUtils } from './openai-model-utils';
import {
    ChatCompletionStreamingAsyncIterator,
    ChatCompletionStreamingAsyncIteratorFactory,
    ChatCompletionToolLoopOptions
} from './openai-chat-completion-stream';
import { OpenAiResponseApiUtils } from './openai-response-api-utils';
import { OpenAiPreferencesSchema } from '../common/openai-preferences';

// We use a connection module to handle AI services separately for each frontend.
const openAiConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService, bindFrontendService }) => {
    bind(OpenAiLanguageModelsManagerImpl).toSelf().inSingletonScope();
    bind(OpenAiLanguageModelsManager).toService(OpenAiLanguageModelsManagerImpl);
    bind(OpenAiModel).toSelf().inTransientScope();
    bind(OpenAiLanguageModelFactory).toFactory<OpenAiModel, [OpenAiModelParams]>(
        ({ container }) => params => {
            const child = new Container();
            child.parent = container;
            child.bind(OpenAiModelParams).toConstantValue(params);
            return child.get(OpenAiModel);
        }
    );
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(OPENAI_LANGUAGE_MODELS_MANAGER_PATH, () => ctx.container.get(OpenAiLanguageModelsManager))
    ).inSingletonScope();
});

export default new ContainerModule(bind => {
    bind(PreferenceContribution).toConstantValue({ schema: OpenAiPreferencesSchema });
    bind(OpenAiModelUtils).toSelf().inSingletonScope();
    bind(OpenAiResponseApiUtils).toSelf().inSingletonScope();
    bind(ChatCompletionStreamingAsyncIterator).toSelf().inTransientScope();
    bind(ChatCompletionStreamingAsyncIteratorFactory).toFactory<ChatCompletionStreamingAsyncIterator, [ChatCompletionToolLoopOptions]>(
        ({ container }) => options => {
            const child = new Container();
            child.parent = container;
            child.bind(ChatCompletionToolLoopOptions).toConstantValue(options);
            return child.get(ChatCompletionStreamingAsyncIterator);
        }
    );
    bind(ConnectionContainerModule).toConstantValue(openAiConnectionModule);
});
