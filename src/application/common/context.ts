import { PredicateExt } from './predicates';

export interface Context<T> extends PredicateExt<T> {
    /**
     * The unique ID of the current context.
     */
    readonly id: string;
}