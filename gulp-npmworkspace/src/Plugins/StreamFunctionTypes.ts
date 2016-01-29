import File = require("vinyl");

/**
 * A callback that can be used to write an object or an error onto a stream.
 */
export type TransformCallback = (error?: Error, file?: File) => void;

/**
 * A function that can be invoked to transform an object within a stream.
 */
export type TransformAction = (file: File, encoding: string, callback: TransformCallback) => void;

/**
 * A callback that is used to complete the flushing of a stream.
 */
export type FlushCallback = (error?: Error) => void;

/**
 * A function that can be invoked once all objects have been written to a stream.
 */
export type FlushAction = (callback: FlushCallback) => void;
