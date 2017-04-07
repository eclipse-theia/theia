import { BaseLanguageClient } from '../common';

export const LanguageContributor = Symbol('LanguageContributor');

export interface LanguageContributor {
    createLanguageClient(services: BaseLanguageClient.IServices): BaseLanguageClient;
}
