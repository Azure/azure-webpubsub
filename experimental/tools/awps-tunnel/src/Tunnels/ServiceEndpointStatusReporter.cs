using System.Net.Sockets;
using System.Net.WebSockets;

using Microsoft.AspNetCore.SignalR;

class ServiceEndpointStatusReporter : IServiceEndpointStatusReporter
{
    public static string? LatestLiveTraceUrl { get; private set; }
    public static string? LatestServiceUrl { get; private set; }

    public static string? LocalServerUrl { get; private set; }

    public static ConnectionStatus LatestTunnelConnectionStatus { get; private set; }
    public static HttpConnectionStatus LatestLocalServerHttpStatus { get; private set; }
    private readonly IHubContext<DataHub, IServiceEndpointStatusReporter> _context;

    public ServiceEndpointStatusReporter(IHubContext<DataHub, IServiceEndpointStatusReporter> context)
    {
        _context = context;
    }

    public Task ReportLiveTraceUrl(string url)
    {
        LatestLiveTraceUrl = url;
        return _context.Clients.All.ReportLiveTraceUrl(LatestLiveTraceUrl);
    }

    public Task ReportServiceEndpoint(string endpoint)
    {
        LatestServiceUrl = endpoint;
        return _context.Clients.All.ReportServiceEndpoint(LatestServiceUrl);
    }

    public Task ReportStatusChange(ConnectionStatus status)
    {
        LatestTunnelConnectionStatus = status;
        return _context.Clients.All.ReportStatusChange(LatestTunnelConnectionStatus);
    }

    public Task ReportLocalServerUrl(string url)
    {
        LocalServerUrl = url;
        return _context.Clients.All.ReportLocalServerUrl(LocalServerUrl);

    }

    public Task ReportTunnelToLocalServerStatus(HttpConnectionStatus status)
    {
        LatestLocalServerHttpStatus = status;
        return _context.Clients.All.ReportTunnelToLocalServerStatus(LatestLocalServerHttpStatus);
    }
}
