using System.Collections.Concurrent;

using Microsoft.AspNetCore.SignalR;

public enum ConnectionStatus
{
    Connecting,
    Connected,
    Reconnecting,
    Disconnected
}

public record ConnectionStatusPair(ConnectionStatus StatusIn, ConnectionStatus StatusOut)
{
    public static ConnectionStatusPair Success = new ConnectionStatusPair(ConnectionStatus.Connected, ConnectionStatus.Connected);
    public static ConnectionStatusPair RequestFailed = new ConnectionStatusPair(ConnectionStatus.Disconnected, ConnectionStatus.Disconnected);
    public static ConnectionStatusPair RequestTimeout = new ConnectionStatusPair(ConnectionStatus.Disconnected, ConnectionStatus.Disconnected);
    public static ConnectionStatusPair ErrorResponse = new ConnectionStatusPair(ConnectionStatus.Connected, ConnectionStatus.Disconnected);
}

public interface IOutput
{
    void AddLog(string log);
    Uri? WebviewUri { set; }
    void AddRequest(HttpItem request);
    ConnectionStatus Status { set; }
}

class PlainOutput : IOutput
{
    private readonly ILogger _logger;
    private ConnectionStatus _status = ConnectionStatus.Connecting;
    private Uri? _webviewUri = null;

    public PlainOutput(ILogger<TunnelService> logger)
    {
        _logger = logger;
    }
    public ConnectionStatus Status
    {
        set
        {
            _status = value;
            _logger.LogInformation($"Tunnel <-> Web PubSub: {value}");
        }
    }
    public Uri? WebviewUri
    {
        set
        {
            _webviewUri = value;
            _logger.LogInformation($"View the requests in the web view: {value}");

        }
    }

    public void AddLog(string log)
    {
        _logger.LogInformation(log);
    }

    public void AddRequest(HttpItem request)
    {
        _logger.LogInformation($"RequestedAt: {request.RequestAtOffset}; Uri: {request.Url}; Code: {request.Code};");
    }

    public Task DrawAsync(CancellationToken cancellationToken)
    {
        return Task.CompletedTask;
    }
}

class ConsoleUILoggerProvider : ILoggerProvider
{
    private readonly IOutput _output;

    public IHubContext<DataHub, IDataHubClient>? HubContext { get; set; }

    public ConsoleUILoggerProvider(IOutput output)
    {
        _output = output;
    }
    public ILogger CreateLogger(string categoryName)
    {
        return new ConsoleUILogger(_output, this);
    }

    public void Dispose()
    {
        throw new NotImplementedException();
    }

    private sealed class ConsoleUILogger : ILogger
    {
        private readonly IOutput _consoleUI;
        private readonly ConsoleUILoggerProvider _provider;

        public ConsoleUILogger(IOutput consoleUI, ConsoleUILoggerProvider provider)
        {
            _consoleUI = consoleUI;
            _provider = provider;
        }

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull
        {
            return null;
        }

        public bool IsEnabled(LogLevel logLevel)
        {
            return true;
        }

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            var log = $"[{DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")}][{logLevel}]: {formatter.Invoke(state, exception)}";
            _consoleUI.AddLog(log);
            if (_provider.HubContext != null)
            {
                _provider.HubContext.Clients
                    .All.UpdateLogs(new LogItem { Level = logLevel, Time = DateTime.UtcNow, Message = formatter.Invoke(state, exception) });
            }
        }
    }
}
