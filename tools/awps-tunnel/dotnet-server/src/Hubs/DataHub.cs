using Azure.Messaging.WebPubSub;

using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

public interface IDataHub
{
    Task<DataModel> GetCurrentModel();
}

public interface IStateNotifier : IStateReporter
{
    Task AddTraffic(HttpItem traffic, CancellationToken token);
    Task UpdateTraffic(HttpItem traffic, CancellationToken token);
    State State { get; }
}

public interface IStateReporter
{
    Task UpdateLogs(params LogItem[] logs);
    Task ReportLiveTraceUrl(string url);
    Task ReportServiceEndpoint(string url);
    Task ReportLocalServerUrl(string url);
    Task ReportStatusChange(ConnectionStatus status);
    Task ReportTunnelToLocalServerStatus(ConnectionStatusPair status);
}

public interface IDataHubClient: IStateReporter
{
    Task UpdateTraffic(HttpItem traffic);
    Task AddTraffic(HttpItem traffic);
}

internal class StateNotifier : IStateNotifier
{
    public State State { get; }

    private readonly IRepository<HttpDataModel> _store;
    private readonly IHubContext<DataHub, IDataHubClient> _hubContext;

    public StateNotifier(IRepository<HttpDataModel> store, IHubContext<DataHub, IDataHubClient> hubContext, IOptions<TunnelServiceOptions> options)
    {
        _store = store;
        _hubContext = hubContext;
        State = new State
        {
            Hub = options.Value.Hub,
        };
    }

    public Task ReportLiveTraceUrl(string url)
    {
        State.LiveTraceUrl = url;
        return _hubContext.Clients.All.ReportLiveTraceUrl(url);
    }

    public Task ReportServiceEndpoint(string endpoint)
    {
        State.Endpoint = endpoint;
        return _hubContext.Clients.All.ReportServiceEndpoint(endpoint);
    }

    public Task ReportStatusChange(ConnectionStatus status)
    {
        State.TunnelConnectionStatus = status;
        return _hubContext.Clients.All.ReportStatusChange(status);
    }

    public Task ReportLocalServerUrl(string url)
    {
        State.UpstreamServerUrl = url;
        return _hubContext.Clients.All.ReportLocalServerUrl(url);
    }

    public Task ReportTunnelToLocalServerStatus(ConnectionStatusPair status)
    {
        State.TunnelServerStatus = status;
        return _hubContext.Clients.All.ReportTunnelToLocalServerStatus(status);
    }

    public Task UpdateLogs(params LogItem[] logs)
    {
        return _hubContext.Clients.All.UpdateLogs(logs);
    }

    public async Task UpdateTraffic(HttpItem traffic, CancellationToken token)
    {
        await _store.UpdateAsync(traffic.DataModel, token);
        await _hubContext.Clients.All.UpdateTraffic(traffic);
    }

    public async Task AddTraffic(HttpItem traffic, CancellationToken token)
    {
        await _store.AddAsync(traffic.DataModel, token);
        await _hubContext.Clients.All.AddTraffic(traffic);
    }
}

public class DataHub : Hub<IDataHubClient>, IDataHub
{
    private readonly WebPubSubServiceClient _serviceClient;
    private readonly IStateNotifier _state;
    private readonly IRepository<HttpDataModel> _repo;

    public DataHub(WebPubSubServiceClient serviceClient, IStateNotifier state, IRepository<HttpDataModel> repo)
    {
        _serviceClient = serviceClient;
        _state = state;
        _repo = repo;
    }

    public async Task<DataModel> GetCurrentModel()
    {
        _state.State.ClientUrl = await GetClientAccessUrl();
        return new DataModel
        {
            TrafficHistory = (await _repo.GetRangeAsync(50, Context.ConnectionAborted)).Select(s => new HttpItem(s)).ToList(),
            State = _state.State
        };
    }

    public async Task<string> GetClientAccessUrl()
    {
        return (await _serviceClient.GetClientAccessUriAsync(expiresAfter: TimeSpan.FromHours(1))).ToString();
    }
}

public class State
{
    public string Endpoint { get; set; } = string.Empty;
    public string Hub { get; set; } = string.Empty;
    public string ClientUrl { get; set; } = string.Empty;
    public string LiveTraceUrl { get; set; } = string.Empty;
    public string UpstreamServerUrl { get; set; } = string.Empty;
    public ConnectionStatus TunnelConnectionStatus { get; set; } = ConnectionStatus.Disconnected;
    public ConnectionStatusPair TunnelServerStatus { get; set; }
    = new(ConnectionStatus.Disconnected, ConnectionStatus.Disconnected);

}

public class DataModel
{
    public State State { get; set; } = new State();
    public List<LogItem> Logs { get; set; } = new List<LogItem>();
    public List<HttpItem> TrafficHistory { get; set; } = new List<HttpItem>();
}

public class LogItem
{
    public LogLevel Level { get; set; }
    public string Message { get; set; } = string.Empty;
    public DateTime Time { get; set; }
}