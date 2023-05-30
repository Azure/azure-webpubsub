using System.Net;
using System.Text;
internal static class Utilities
{
    public static async Task Delay(int millisecondsDelay, CancellationToken token)
    {
        try
        {
            await Task.Delay(millisecondsDelay, token);
        }
        catch (OperationCanceledException)
        {
        }
    }

    public static Task WithRetry(this Func<CancellationToken, Task> task, int? maxRetry, ILogger logger, CancellationToken cancellationToken) => WithRetry(task, logger, (i) =>
    {
        if (i < 5 && (maxRetry == null || i < maxRetry))
        {
            return i + 1;
        }
        return maxRetry == null ? 5 : null;
    }, cancellationToken);

    public static async Task WithRetry(this Func<CancellationToken, Task> task, ILogger logger, Func<int, int?> delaySecondsCalc, CancellationToken cancellationToken)
    {
        var count = 0;
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                count++;
                await task(cancellationToken);
                return;
            }
            catch (Exception ex)
            {
                var delay = delaySecondsCalc?.Invoke(count);
                if (delay == null)
                {
                    throw;
                }
                logger.LogError($"Retry {count} in {delay} seconds. Error: {ex.Message}.");
                await Delay(delay.Value * 1000, cancellationToken);
            }
        }
    }

    public static string DumpRaw(this TunnelRequestMessage request)
    {
        var sb = new StringBuilder();

        // Write the request line
        sb.AppendLine($"{request.HttpMethod} {request.Url} HTTP/1.1");

        // Write the headers
        foreach (var header in request.Headers)
        {
            sb.AppendLine($"{header.Key}: {string.Join(", ", header.Value)}");
        }

        if (request.Content.Length > 0)
        {
            // Write a blank line to separate headers from content
            sb.AppendLine();

            // Write the content
            // TODO: support other encoding based on content-type
            var content = Encoding.UTF8.GetString(request.Content.Span);
            sb.AppendLine(content);
        }

        return sb.ToString();
    }

    public static string DumpRaw(this TunnelResponseMessage response)
    {
        var sb = new StringBuilder();

        // Write the status line, use the default reason phrase
        sb.AppendLine($"HTTP/1.1 {response.StatusCode} {new HttpResponseMessage((HttpStatusCode)response.StatusCode).ReasonPhrase}");

        // Write the headers
        foreach (var header in response.Headers)
        {
            sb.AppendLine($"{header.Key}: {string.Join(", ", header.Value)}");
        }

        if (response.Content.Length > 0)
        {
            // Write a blank line to separate headers from content
            sb.AppendLine();

            // Write the content
            // TODO: support other encoding based on content-type
            var content = Encoding.UTF8.GetString(response.Content.Span);
            sb.AppendLine(content);
        }

        return sb.ToString();
    }
}