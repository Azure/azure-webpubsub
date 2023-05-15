public interface IServiceEndpointStatusReporter
{
    Task ReportStatusChange(ConnectionStatus status);
    Task ReportServiceEndpoint(string endpoint);
    Task ReportLiveTraceUrl(string url);
    Task ReportLocalServerUrl(string url);
    Task ReportTunnelToLocalServerStatus(HttpConnectionStatus status);
}
