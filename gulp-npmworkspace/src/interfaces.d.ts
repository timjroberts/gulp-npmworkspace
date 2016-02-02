/**
 * A map of values.
 */
declare interface IDictionary<TValue> {
    /**
     * Retrieves the value associated with the given key.
     *
     * @returns A [[TValue]] value.
     */
    [key: string]: TValue;
}
