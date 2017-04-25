export interface Context<T> {
    /**
     * The unique ID of the current context.
     */
    readonly id: string;

    isEnabled(arg?: T): boolean;
}