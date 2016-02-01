import * as util from "gulp-util";
import File = require("vinyl");

import {getWorkspacePluginOptions, NpmWorkspacePluginOptions} from "../../NpmWorkspacePluginOptions";

/**
 * A function that can be invoked to write a message to the log.
 */
export type WriteLogAction = (logFunc: (message: string | Chalk.ChalkChain) => void) => void;

/**
 * A utility that supports writing log messages.
 */
export class Logger {
    /**
     * Logs an error message.
     *
     * @param message The message to log.
     * @param file An optional [[File]] object that was the cause of the message being logged.
     */
    public static error(message: string | Chalk.ChalkChain, file?: File): void {
        Logger.logInternal(message, file);
    }

    /**
     * Logs a warning.
     *
     * @param message The message to log.
     * @param file An optional [[File]] object that was the cause of the message being logged.
     */
    public static warn(message: string | Chalk.ChalkChain, file?: File): void {
        Logger.logInternal(message, file);
    }

    /**
     * Logs an informational message.
     *
     * @param message The message to log.
     * @param file An optional [[File]] object that was the cause of the message being logged.
     */
    public static info(message: string | Chalk.ChalkChain, file?: File): void {
        Logger.logInternal(message, file);
    }

    /**
     * Logs a verbose informational message.
     *
     * @param message The message to log or a [[WriteLogAction]] that will be invoked to
     * retrieve the message.
     * @param file An optional [[File]] object that was the cause of the message being logged.
     *
     * The message will only be logged if verbose logging is set in the options for the file, or
     * if not provided, is set in the global workspace plugin options.
     */
    public static verbose(message: string | Chalk.ChalkChain | WriteLogAction, file?: File): void {
        let options: NpmWorkspacePluginOptions = file ? (<any>file).workspaceOptions : getWorkspacePluginOptions();

        if (!options.enableLogging || !options.verboseLogging) return;

        if (typeof message === "function") {
            return (<WriteLogAction>message)(util.log);
        }

        util.log(message);
    }

    private static logInternal(message: string | Chalk.ChalkChain, file?: File): void {
        let options: NpmWorkspacePluginOptions = file ? (<any>file).workspaceOptions : getWorkspacePluginOptions();

        if (!options.enableLogging) return;

        util.log(message);
    }
}
