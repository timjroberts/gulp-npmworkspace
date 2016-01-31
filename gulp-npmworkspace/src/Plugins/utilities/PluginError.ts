/**
 * Options to use when processing [[PluginError]] objects.
 */
export interface PluginErrorOptions {
    /**
     * A boolean value that indicates whether the Gulp plugin should continue processing
     * files in the stream.
     */
    continue?: boolean
}

/**
 * An error that can be thrown to indicate that an error has occured within a Gulp plugin
 * implementation.
 */
export class PluginError extends Error {
    /**
     * Initializes the new Plugin error.
     *
     * @param shortMessage A short message.
     * @param consoleMessage A longer message that can be displayed in the console window.
     * @param options A [[PluginErrorOptions]] object that describes the options assocaited
     * with this plugin error.
     */
    constructor(shortMessage: string, public consoleMessage: string, public options: PluginErrorOptions = { continue: true }) {
        super();

        this.message = shortMessage;
    }
}
