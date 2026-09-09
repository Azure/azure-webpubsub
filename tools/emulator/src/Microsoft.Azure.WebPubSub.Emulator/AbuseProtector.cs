// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Collections.Concurrent;
using System.Net;
using Microsoft.Extensions.Logging;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class AbuseProtector(IHttpClientFactory clients, TimeProvider timeProvider, ILogger<AbuseProtector> logger)
{
    private static readonly TimeSpan MaxValidateInterval = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan MinValidateInterval = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan ValidateTimeout = TimeSpan.FromSeconds(10);
    private readonly ConcurrentDictionary<Uri, ValidationRecord> _records = new();

    public Task<bool> ValidateAsync(Uri uri, string host)
    {
        var record = _records.GetOrAdd(uri, _ => new ValidationRecord());
        lock (record)
        {
            if (timeProvider.GetUtcNow() >= record.NextValidation && record.Refresh is not { IsCompleted: false })
            {
                record.Refresh = RefreshAsync(record, uri, host);
            }

            // Like runtime, block initial validation; later refreshes use the last known result.
            return record.Initialized ? Task.FromResult(record.Success) : record.Refresh!;
        }
    }

    private async Task<bool> RefreshAsync(ValidationRecord record, Uri uri, string host)
    {
        var success = false;
        try
        {
            var result = await SendValidationAsync(uri, HttpMethod.Options, host);
            if (result.StatusCode == HttpStatusCode.NotFound)
            {
                result = await SendValidationAsync(uri, HttpMethod.Get, host);
            }
            success = result.Allowed;
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Upstream webhook validation failed.");
        }

        lock (record)
        {
            record.Interval = success ? MaxValidateInterval : record.Success ? MinValidateInterval :
                TimeSpan.FromTicks(Math.Min(record.Interval.Ticks * 2, MaxValidateInterval.Ticks));
            record.Success = success;
            record.Initialized = true;
            record.NextValidation = timeProvider.GetUtcNow() + record.Interval;
        }
        return success;
    }

    private async Task<(HttpStatusCode StatusCode, bool Allowed)> SendValidationAsync(Uri uri, HttpMethod method, string host)
    {
        using var client = clients.CreateClient(HttpUpstreamTrigger.HttpClientName);
        using var request = new HttpRequestMessage(method, uri) { Version = HttpVersion.Version20 };
        request.Headers.Add("WebHook-Request-Origin", host);
        request.Headers.Add("ce-awpsversion", "1.0");
        using var timeout = new CancellationTokenSource(ValidateTimeout, timeProvider);
        using var response = await client.SendAsync(request, timeout.Token);
        var allowed = response.IsSuccessStatusCode &&
            response.Headers.TryGetValues("WebHook-Allowed-Origin", out var origins) &&
            origins.Any(origin => origin == "*" || string.Equals(origin, host, StringComparison.OrdinalIgnoreCase));
        return (response.StatusCode, allowed);
    }

    private sealed class ValidationRecord
    {
        public bool Initialized;
        public bool Success = true;
        public TimeSpan Interval = MinValidateInterval;
        public DateTimeOffset NextValidation;
        public Task<bool>? Refresh;
    }
}