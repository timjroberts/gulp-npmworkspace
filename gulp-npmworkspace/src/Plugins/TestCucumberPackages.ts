import * as _ from "underscore";
import * as util from "gulp-util";
import * as glob from "glob";
import * as path from "path";
import * as fs from "fs";

import {packageDescriptorPlugin} from "./utilities/PackageDescriptorPlugin";
import {PackageDescriptor} from "../PackageDescriptor";
import {NpmWorkspacePluginOptions, getWorkspacePluginOptions} from "../NpmWorkspacePluginOptions";
import {PluginError, PluginErrorOptions} from "./utilities/PluginError";
import {Logger} from "./utilities/Logging";

/**
 * Options for runCucumber().
 */
export interface CucumberTestOptions {
    /**
     * true to continue streaming 'package.json' files if the TypeScript compilation yields errors.
     *
     * Defaults to true.
     */
    continueOnError?: boolean;
}

/**
 * Provides context for the runCucumber Gulp plugin.
 */
class CucumberTestBinding {
    /**
     * Initialises the new binding object.
     *
     * @param options The options that are to be associated with the running plugin implementation.
     */
    constructor(public options: CucumberTestOptions & NpmWorkspacePluginOptions) {
    }
}

/**
 * Creates a binding for the [[runCucumber]] plugin.
 *
 * @returns An [[CucumberTestBinding]] object.
 */
function testCucumberPackageBinding(options?: CucumberTestOptions): CucumberTestBinding {
    return new CucumberTestBinding(_.extend(getWorkspacePluginOptions(options), { continueOnError: true }, options));
}

/**
 * The [[runCucumber]] plugin implementation.
 *
 * @param packageDescriptor The package descriptor representing the 'package.json' file.
 * @param packagePath The path to the package.
 */
function testCucumberPackage(packageDescriptor: PackageDescriptor, packagePath: string): Promise<void> {
    let pluginBinding: CucumberTestBinding = this;

    return new Promise<void>((resolve, reject) => {
        try {
            let localCucumberPath = path.join(packagePath, "./node_modules/cucumber/bin/cucumber.js");
            let hasLocalCucumber = fs.existsSync(localCucumberPath);
            let workspaceCucumberPath = path.join(pluginBinding.options.cwd, "./node_modules/cucumber/bin/cucumber.js");
            let hasWorkspaceCucumber = fs.existsSync(workspaceCucumberPath);

            if (!hasLocalCucumber && !hasWorkspaceCucumber) {
                return handleError(new Error("Could not load the 'cucumber' package. Add 'cucumber' to the workspace 'package.json'."),
                                   packageDescriptor.name, pluginBinding.options.continueOnError, reject);
            }

            let cucumber: any;

            try {
                cucumber = require("cucumber");
            }
            catch (error) {
                return handleError(new Error("Could not load the 'cucumber' package. Add 'cucumber' to the workspace 'package.json'."),
                                   packageDescriptor.name, pluginBinding.options.continueOnError, reject);
            }

            let featurePaths = glob.sync("./features", { cwd: packagePath });

            if (!featurePaths || featurePaths.length === 0) {
                featurePaths = glob.sync("./*/features", { cwd: packagePath });
            }

            if (!featurePaths || featurePaths.length === 0) {
                Logger.warn(`Could not find a 'features' folder for workspace package '${util.colors.cyan(packageDescriptor.name)}'`);

                return resolve();
            }

            let supportCodePaths = _.union(glob.sync("./support", { cwd: packagePath }),
                                           glob.sync("./step_definitions", { cwd: packagePath }),
                                           glob.sync("./*/support", { cwd: packagePath }),
                                           glob.sync("./*/step_definitions", { cwd: packagePath }));

            let cmdArgs = [ "node", hasLocalCucumber ? localCucumberPath : workspaceCucumberPath, path.join(packagePath, featurePaths[0]) ];

            supportCodePaths.forEach((supportCodePath) => {
                cmdArgs = cmdArgs.concat("-r").concat(path.join(packagePath, supportCodePath));
            });

            cucumber.Cli(cmdArgs).run((success) => {
                if (success) {
                    return resolve();
                }

                return handleError(new Error("Tests failed."),
                                   packageDescriptor.name, pluginBinding.options.continueOnError, reject);
            });
        }
        catch (error) {
            handleError(error, packageDescriptor.name, pluginBinding.options.continueOnError, reject);
        }
    });
}

function handleError(error: any, packageName: string, continueOnError: boolean, rejectFunc: (error?: any) => void) {
    rejectFunc(new PluginError("Error running Cucumber in a workspace package",
                               `Error running Cucumber in workspace package '${util.colors.cyan(packageName)}':\n${util.colors.red(error.message)}`,
                               { continue: continueOnError }));
}

/**
 * A Gulp plugin that accepts and returns a stream of 'package.json' files and attempts to run Cucumber
 * for each one.
 *
 * @param options A optional hash of [[CucumberTestOptions]].
 *
 * @returns A stream that contains the 'package.json' files.
 */
export var runCucumber: (options?: CucumberTestOptions & NpmWorkspacePluginOptions) => NodeJS.ReadWriteStream = packageDescriptorPlugin(testCucumberPackage, testCucumberPackageBinding);
