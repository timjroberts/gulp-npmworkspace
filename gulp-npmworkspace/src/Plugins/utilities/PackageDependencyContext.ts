import {DepGraph} from "dependency-graph";
import File = require("vinyl");

import {getPackageName} from "../../utilities/CommandLine";
import {PackageDescriptor} from "../../PackageDescriptor";

/**
 * Collects workspace packages and the dependencies between them.
 */
export class PackageDependencyContext {
    private _packageGraph: DepGraph = new DepGraph();
    private _packageMap: IDictionary<File> = { };

    /**
     * Adds a package.
     *
     * @param packageDescriptor The package descriptor of the package to add.
     * @param file The 'Gulp' file that represents the package descriptor.
     */
    public addPackage(packageDescriptor: PackageDescriptor, file: File): void {
        this._packageGraph.addNode(packageDescriptor.name);
        this._packageMap[packageDescriptor.name] = file;
    }

    /**
     * Adds a dependency between two packages.
     *
     * @param packageDescriptor The package descriptor of the package that is the 'dependant'.
     * @param packageDependencyName The name of the package that is the 'dependency'.
     */
    public addPackageDependency(packageDescriptor: PackageDescriptor, packageDependencyName: string): void {
        this._packageGraph.addNode(packageDependencyName);
        this._packageGraph.addDependency(packageDescriptor.name, packageDependencyName);
    }

    /**
     * Writes the current collection of packages to a stream in dependency order.
     *
     * @param targetStream The stream that will be written.
     * @param startingPackage The name of the workspace package to focus streaming on.
     * @param transformFunc An optional function that can transform the 'Gulp' file before it is written to the
     * stream.
     */
    public writeToStream(targetStream: NodeJS.ReadWriteStream, startingPackage?: string, transformFunc?: (file: File) => File): void {
        let collectFunc = function(packageName: string) {
            var packageFile: File = this._packageMap[packageName];

            if (packageFile) {
                packageFile = transformFunc ? transformFunc(packageFile) : packageFile;

                (<any>targetStream).push(packageFile);
            }
        }

        if (startingPackage) {
            this._packageGraph.dependenciesOf(startingPackage).forEach(collectFunc, this);
            collectFunc.call(this, startingPackage);

        }
        else {
            this._packageGraph.overallOrder().forEach(collectFunc, this);
        }
    }
}
