import { Plugin } from 'vite';

/**
 * Configuration options for the component tagger plugin
 */
interface ComponentTagOptions {
    /**
     * Custom list of element names to include (overrides default behavior)
     * If provided, only these elements will be tagged
     */
    includeElements?: string[];
    /**
     * Custom list of element names to exclude
     * These elements will never be tagged, even if they match other criteria
     */
    excludeElements?: string[];
    /**
     * File extensions to process
     * @default ['.jsx', '.tsx', '.js', '.ts']
     */
    extensions?: string[];
    /**
     * Whether to enable verbose logging
     * @default false
     */
    verbose?: boolean;
    /**
     * Custom function to determine if an element should be tagged
     * This function will be called for each element and should return true if it should be tagged
     */
    shouldTag?: (elementName: string) => boolean;
    /**
     * Custom attributes to extract and include in the data-component-content
     * These will be added to the default set of extracted attributes
     */
    extractAttributes?: string[];
    /**
     * Custom attribute prefix for all data attributes
     * @default 'data-component'
     */
    attributePrefix?: string;
    /**
     * Whether to include the content attribute with encoded component information
     * @default true
     */
    includeContentAttribute?: boolean;
    /**
     * Maximum length for the content attribute value
     * If the encoded content exceeds this length, it will be truncated
     * @default 1000
     */
    maxContentLength?: number;
    /**
     * Whether to include legacy attributes (path, line, file, name)
     * @default true
     */
    includeLegacyAttributes?: boolean;
    /**
     * Custom function to generate the component ID
     * @default (filePath, line, column) => `${filePath}:${line}:${column}`
     */
    generateComponentId?: (filePath: string, line: number, column: number) => string;
    /**
     * Whether to add source maps
     * @default true
     */
    sourceMaps?: boolean;
    /**
     * Custom directories to exclude
     * @default []
     */
    excludeDirectories?: string[];
    /**
     * Whether to process node_modules
     * @default false
     */
    processNodeModules?: boolean;
    /**
     * Output directory for the HTML component tagger script
     * @default 'public'
     */
    outputDir?: string;
    /**
     * Name of the HTML component tagger script
     * @default 'dhws-data-injector.js'
     */
    injectorScriptName?: string;
    /**
     * Name of the HTML component tagger script
     * @default 'dhws-web-inspector.js'
     */
    inspectorScriptName?: string;
    /**
     * Name of the error tracker script
     * @default 'dhws-error-tracker.js'
     */
    errorTrackerScriptName?: string;
}

/**
 * Creates a Vite plugin that tags JSX components with data attributes
 * @param options Configuration options for the component tagger
 * @returns A Vite plugin
 */
declare function createVitePlugin(options?: ComponentTagOptions): Plugin;

export { type ComponentTagOptions, createVitePlugin, createVitePlugin as default };
