using System.CommandLine;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;

using Azure.Identity;
using Azure.Messaging.WebPubSub;

using Microsoft.AspNetCore.SignalR;


var command = new RootCommand("Azure Web PubSub tunnel tool");

var userDataFolder = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
var appDataFile = Path.Combine(userDataFolder, command.Name, "settings.json");

var storageFile = Path.Combine(userDataFolder, command.Name, "data.sqlite");
var dirFile = Path.GetDirectoryName(appDataFile);
Directory.CreateDirectory(dirFile!);

var config = new ConfigurationBuilder()
    .AddJsonFile("appsettings.json", true, true)
    .AddJsonFile(appDataFile, true, true)
    .AddEnvironmentVariables().Build();

var appConfig = config.GetSection("WebPubSub").Get<WebPubSubConfig>() ?? new WebPubSubConfig();

var test = config.ToString();

var disableWebViewOption = new Option<bool>("--noWebView", "Optional. By default a web view is provided to visualize the data flow");
var urlOption = new Option<string?>("--url", " Specify the Web PubSub service endpoint URL to connect to");
var hubOption = new Option<string?>("--hub", "Specify the hub to connect to");
var portOptions = new Option<int?>("--port", "Optional. Specify the port of localhost server, default is 8080.");
var schemeOption = new Option<SupportedScheme?>("--scheme", "Optional. Specify the scheme used to invoke the upstream, supported options are http and https, default is http");

var connectionStringOption = new Option<string>("--cs", "Optional. Specify the connection string to the service");

var runCommand = new Command("run", "Start the tunnel to the Web PubSub service")
{
    disableWebViewOption, hubOption, urlOption, connectionStringOption, schemeOption, portOptions
};
int returnCode = 0;
runCommand.SetHandler(HandleRunAsync, disableWebViewOption, hubOption, urlOption, connectionStringOption, schemeOption, portOptions);

var statusCommand = new Command("status", "Show the current status.");
statusCommand.SetHandler(() => appConfig.Print(Console.Out));

var bindCommand = new Command("bind", "Bind to the Web PubSub service")
{
    urlOption, hubOption
};
bindCommand.SetHandler(HandleBind, urlOption, hubOption);

command.AddCommand(runCommand);
command.AddCommand(statusCommand);
command.AddCommand(bindCommand);

try
{
    await command.InvokeAsync(args);
    return returnCode;
}
catch (Exception e)
{
    Console.Error.WriteLine("Error:" + e.Message);
    return 1;
}

void HandleBind(string? url, string? hub)
{
    if (string.IsNullOrEmpty(url) && string.IsNullOrEmpty(hub))
    {
        Console.Error.WriteLine("Neither --url nor --hub is specified.");
        returnCode = 1;
        return;
    }

    if (!Uri.TryCreate(url, UriKind.Absolute, out _))
    {
        Console.Error.WriteLine("Invalid URL format: " + url);
        returnCode = 1;
        return;
    }

    // store to local file config
    appConfig.Endpoint = url ?? appConfig.Endpoint;
    appConfig.Hub = hub ?? appConfig.Hub;
    appConfig.Print(Console.Out);
    File.WriteAllText(appDataFile, JsonSerializer.Serialize(new { WebPubSub = appConfig }, new JsonSerializerOptions { WriteIndented = true })); ;
    Console.Out.WriteLine($"Settings stored to {appDataFile}");
}

async Task HandleRunAsync(bool disableWebView, string? hub, string? endpoint, string? connectionString, SupportedScheme? scheme, int? port)
{
    hub ??= appConfig.Hub;
    if (hub == null)
    {
        Console.Error.WriteLine("Hub is neither passed in using --hub nor binded.");
        returnCode = 1;
        return;
    }
    appConfig.Hub = hub;
    endpoint ??= appConfig.Endpoint;
    appConfig.Endpoint = endpoint;
    if (endpoint == null && connectionString == null)
    {
        Console.Error.WriteLine("Endpoint is neither passed in using --url nor binded.");
        Console.Error.WriteLine("Use --url to pass in the endpoint URL or use --cs to pass in the connection string.");
        returnCode = 1;
        return;
    }

    port ??= 8080;
    scheme ??= SupportedScheme.Http;

    Connection connection;
    if (connectionString != null)
    {
        connection = ParsedConnectionString(connectionString);
        appConfig.Endpoint = connection.Endpoint.AbsoluteUri;
    }
    else
    {
        connection = new Connection(new Uri(endpoint!), new DefaultAzureCredential(new DefaultAzureCredentialOptions()
        {
            ExcludeEnvironmentCredential = true,
        }));
    }

    appConfig.Print(Console.Out);

    Console.Out.WriteLine($"Configure the hub event upstream for {appConfig.Hub} as tunnel:///.");
    Console.Out.WriteLine($@"Sample az CLI command: az webpubsub hub create -n ""MyWebPubSub"" -g ""MyResourceGroup"" --hub-name ""{appConfig.Hub}"" --event-handler url-template=""tunnel:///eventhandler"" user-event-pattern=""*"" system-event=""connected"" system-event=""disconnected"" ");

    using var store = new StoreContext(storageFile);
    var contentRoot = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)!;


    WebPubSubServiceClient client;
    if (connection.Key != null)
    {
        client = new WebPubSubServiceClient(connection.Endpoint, hub, new Azure.AzureKeyCredential(connection.Key));
    }
    else
    {
        client = new WebPubSubServiceClient(connection.Endpoint, hub, connection.Credential);
    }

    var appBuilder = WebApplication.CreateBuilder(new WebApplicationOptions()
    {
        ContentRootPath = contentRoot
    });
    appBuilder.Services.AddSingleton<IOutput, PlainOutput>();

    appBuilder.Services.AddControllersWithViews();
    appBuilder.Services.AddSignalR().AddJsonProtocol(s => s.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
    appBuilder.Services.AddHttpClient();
    appBuilder.Services.AddSingleton<TunnelService>();
    appBuilder.Services.AddSingleton<IStateNotifier, StateNotifier>();
    appBuilder.Services.AddSingleton<WebPubSubServiceClient>(s => client);
    appBuilder.Services.Configure<TunnelServiceOptions>(o =>
    {
        o.Endpoint = connection.Endpoint;
        o.Credential = connection.Credential;
        o.Hub = hub;
        o.LocalScheme = scheme.Value.ToString().ToLower();
        o.LocalPort = port.Value;
    });
    appBuilder.Services.AddSingleton<StoreContext>(store);
    appBuilder.Services.AddSingleton<IRepository<HttpItem>, HttpItemRepository>();
    var app = appBuilder.Build();

    app.UseStaticFiles();
    app.UseRouting();

    app.MapHub<DataHub>("/datahub");
    app.MapGet("webpubsuburl", async () =>
    {
        var url = await client.GetClientAccessUriAsync();
        return new
        {
            url,
            endpoint = connection.Endpoint,
            hub,
        };
    });
    app.MapControllerRoute(
        name: "default",
        pattern: "{controller}/{action=Index}/{id?}");
    app.MapFallbackToFile("index.html");

    var tunnelService = app.Services.GetRequiredService<TunnelService>();

    var cts = new CancellationTokenSource();
    Console.CancelKeyPress += (s, e) =>
    {
        Console.Out.WriteLine("Cancelling the application.");
        cts.Cancel();
    };

    var tunnelTask = tunnelService.StartAsync(cts.Token);
    var output = app.Services.GetRequiredService<IOutput>();

    var appTask = Task.CompletedTask;

    if (!disableWebView)
    {
        appTask = app.RunAsync(cts.Token);
        if (appTask.IsFaulted)
        {
            Console.Error.WriteLine("Error starting the webview: " + appTask.Exception!.GetBaseException().Message);
            // although webview fails to start we can still start the tunnel tool
            appTask = Task.CompletedTask;
        }
        else
        {
            var localUrl = new Uri(app.Urls.First());
            output.WebviewUri = localUrl;
        }
    }

    try
    {
        await Task.WhenAll(tunnelTask, appTask);
    }
    catch (OperationCanceledException)
    {
        Console.Out.WriteLine("Exiting the application.");
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine("Exiting the application: " + ex.Message);
        returnCode = 1;
        return;
    }
    finally
    {
        try
        {
            await app.StopAsync();
        }
        catch { }

    }
    Console.Out.WriteLine("Exiting the application.");
}

static Connection ParsedConnectionString(string conn)
{
    var dict = conn.Split(";").Select(s => s.Split('=', 2)).Where(i => i.Length == 2).ToDictionary(j => j[0], j => j[1], StringComparer.OrdinalIgnoreCase);
    if (dict.TryGetValue("version", out var version) && version != "1.0")
    {
        throw new NotSupportedException($"Version {version} is not supported.");
    }
    if (!dict.TryGetValue("endpoint", out var ep) || !Uri.TryCreate(ep, UriKind.Absolute, out var endpoint))
    {
        throw new ArgumentException($"Bad connection string endpoint {ep}");
    }
    if (dict.TryGetValue("port", out var port) && int.TryParse(port, out var portVal))
    {
        var uriBuilder = new UriBuilder(endpoint);
        uriBuilder.Port = portVal;
        endpoint = uriBuilder.Uri;
    }

    if (dict.TryGetValue("AccessKey", out var key))
    {
        return new(endpoint, new KeyTokenCredential(key, 65), key);
    }
    else
    {
        return new(endpoint, new DefaultAzureCredential(new DefaultAzureCredentialOptions
        {
            ExcludeManagedIdentityCredential = true,
            ExcludeInteractiveBrowserCredential = false,
        }));
    }
}

enum SupportedScheme
{
    Http,
    Https
}

class WebPubSubConfig
{
    public string? Endpoint { get; set; }

    public string? Hub { get; set; }

    public void Print(TextWriter output)
    {
        if (Endpoint != null)
        {
            output.WriteLine($"Current Web PubSub service: {Endpoint}.");
        }
        if (Hub != null)
        {
            output.WriteLine($"Current hub: {Hub}.");
        }
    }
}
