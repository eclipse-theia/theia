export interface CombinedSchema {
    allOf: Object[];
}

export const JsonSchema = Symbol("JsonSchema");

export interface JsonSchema {
    getSchema(): CombinedSchema;
}