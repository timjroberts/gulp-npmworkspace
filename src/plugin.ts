import {ArgumentOptions,
        PackageDescriptor} from "./interfaces";

/**
 * The plugin name.
 */
export const pluginName = (<PackageDescriptor>require("../package.json")).name;

/**
 * An object that contains a hash of the associated command line options.
 */
export const argv: ArgumentOptions
    = require("yargs")
    .alias("p", "package")
    .alias("v", "verbose")
    .argv;
