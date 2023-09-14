
using Azure.Core;

public record Connection(Uri Endpoint, TokenCredential Credential, string? Key = null);
