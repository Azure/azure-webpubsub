module.exports = {
    externals: {
    },
resolve: {
    fallback: {
      "events": require.resolve("events/")
    } 
  },
  output: {
    library: "WebPubSubClient",
    libraryTarget: "var",
    libraryExport: "default"
  }
}