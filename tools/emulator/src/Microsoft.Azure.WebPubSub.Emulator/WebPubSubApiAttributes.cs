// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

namespace Microsoft.Azure.WebPubSub.Emulator;

[AttributeUsage(AttributeTargets.Class)]
internal sealed class WebPubSubApiAttribute(string version) : Attribute
{
    public string Version { get; } = version;
}

[AttributeUsage(AttributeTargets.Class, AllowMultiple = true)]
internal sealed class WebPubSubApiOperationAttribute(
    string method,
    string path,
    string operationId) : Attribute
{
    public string Method { get; } = method;

    public string Path { get; } = path;

    public string OperationId { get; } = operationId;
}