declare namespace DependencyGraph {
    export class DepGraph {
        constructor();

        hasNode(name: string): boolean;

        addNode(name: string): void;

        addDependency(from: string, to: string): void;

        dependenciesOf(name: string, leavesOnly?: boolean): Array<string>;

        overallOrder(leavesOnly?: boolean): Array<string>;
    }
}

declare module "dependency-graph" {
   export = DependencyGraph;
}
