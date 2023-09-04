using Azure.Messaging.WebPubSub;

using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

public interface IDataHub
{
    Task<DataModel> GetCurrentModel();
}

public interface IStateNotifier
{
    State State { get; }
    Task ReportLiveTraceUrl(string url);
    Task ReportServiceEndpoint(string url);
    Task ReportStatusChange(ConnectionStatus status);
    Task ReportTunnelToLocalServerStatus(ConnectionStatusPair status);
    Task ReportLocalServerUrl(string url);
}

public interface IDataHubClient
{
    Task UpdateState(State state);
    Task UpdateLogs(params LogItem[] logs);
    Task UpdateTraffics(params HttpItem[] traffics);
}

internal class StateNotifier : IStateNotifier
{
    public State State { get; }

    private readonly IHubContext<DataHub, IDataHubClient> _hubContext;

    public StateNotifier(IHubContext<DataHub, IDataHubClient> hubContext, IOptions<TunnelServiceOptions> options)
    {
        _hubContext = hubContext;
        State = new State
        {
            Hub = options.Value.Hub,
        };
    }

    public Task ReportLiveTraceUrl(string url)
    {
        State.LiveTraceUrl = url;
        return _hubContext.Clients.All.UpdateState(State);
    }

    public Task ReportServiceEndpoint(string endpoint)
    {
        State.Endpoint = endpoint;
        return _hubContext.Clients.All.UpdateState(State);
    }

    public Task ReportStatusChange(ConnectionStatus status)
    {
        State.TunnelConnectionStatus = status;
        return _hubContext.Clients.All.UpdateState(State);
    }

    public Task ReportLocalServerUrl(string url)
    {
        State.UpstreamServerUrl = url;
        return _hubContext.Clients.All.UpdateState(State);
    }

    public Task ReportTunnelToLocalServerStatus(ConnectionStatusPair status)
    {
        State.TunnelServerStatus = status;
        return _hubContext.Clients.All.UpdateState(State);
    }
}

public class DataHub : Hub<IDataHubClient>, IDataHub
{
    private readonly WebPubSubServiceClient _serviceClient;
    private readonly IOptions<TunnelServiceOptions> _options;
    private readonly IStateNotifier _state;
    private readonly ILogger _logger;
    private readonly IRepository<HttpItem> _repo;

    public DataHub(WebPubSubServiceClient serviceClient, IStateNotifier state, ILogger<DataHub> logger, IRepository<HttpItem> repo)
    {
        _serviceClient = serviceClient;
        _state = state;
        _logger = logger;
        _repo = repo;
    }

    public async Task<DataModel> GetCurrentModel()
    {
        _state.State.ClientUrl = await GetClientAccessUrl();
        return new DataModel
        {
            TrafficHistory = await _repo.GetRangeAsync(50, Context.ConnectionAborted),
            State = _state.State
        };
    }

    public async Task<string> GetClientAccessUrl()
    {
        return (await _serviceClient.GetClientAccessUriAsync()).ToString();
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
    public List<HttpItem> TrafficHistory { get; set; } = new List<HttpItem>();
    public List<LogItem> Logs { get; set; } = new List<LogItem>();
}

public class LogItem
{
    public LogLevel Level { get; set; }
    public string Message { get; set; } = string.Empty;
    public DateTime Time { get; set; }
}