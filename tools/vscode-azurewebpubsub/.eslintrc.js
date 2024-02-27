module.exports = {
    "extends": "@microsoft/eslint-config-azuretools",
    rules: {
        "@typescript-eslint/naming-convention": [
            "error",
            {
                "selector": [
                    "classMethod"
                ],
                "format": ["camelCase"],
            }
        ]
    }
};
