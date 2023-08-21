using Microsoft.AspNetCore.SignalR;

public class DataHub : Hub<IServiceEndpointStatusReporter>
{
    public async override Task OnConnectedAsync()
    {
        if (ServiceEndpointStatusReporter.LatestLiveTraceUrl != null)
        {
            await Clients.Caller.ReportLiveTraceUrl(ServiceEndpointStatusReporter.LatestLiveTraceUrl);
        }
        if (ServiceEndpointStatusReporter.LatestServiceUrl != null)
        {
            await Clients.Caller.ReportServiceEndpoint(ServiceEndpointStatusReporter.LatestServiceUrl);
        }
        if (ServiceEndpointStatusReporter.LocalServerUrl != null)
        {
            await Clients.Caller.ReportLocalServerUrl(ServiceEndpointStatusReporter.LocalServerUrl);
        }
        await Clients.Caller.ReportStatusChange(ServiceEndpointStatusReporter.LatestTunnelConnectionStatus);
    }
}
