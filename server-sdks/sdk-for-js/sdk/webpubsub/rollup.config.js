import rollup from "rollup";
import nodeResolve from "rollup-plugin-node-resolve";
import sourcemaps from "rollup-plugin-sourcemaps";

/**
 * @type {rollup.RollupFileOptions}
 */
const config = {
  input: [
    "./esm/index.js",
  ],
  external: [
    "@azure/ms-rest-js",
    "@azure/core-http",
    "jsonwebtoken",
    "@azure/ms-rest-azure-js",
    "cloudevents",
    "express",
  ],
  output: {
    file: "./dist/webpubsub.js",
    format: "umd",
    name: "Azure.WebPubSub",
    sourcemap: true,
    globals: {
      "@azure/ms-rest-js": "msRest",
      "@azure/ms-rest-azure-js": "msRestAzure",
      "jsonwebtoken": "jwt",
      "typescript-base64-arraybuffer": "decode",
      "express": "express"
    },
    banner: `/*
 * Code generated by Microsoft (R) AutoRest Code Generator.
 * Changes may cause incorrect behavior and will be lost if the code is regenerated.
 */`
  },
  plugins: [
    nodeResolve({ mainFields: ['module', 'main'], preferBuiltins: true }),
    sourcemaps()
  ]
};

export default config;
