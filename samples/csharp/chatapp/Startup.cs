using System;
using System.IO;
using System.Runtime.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Azure.WebPubSub.AspNetCore;
using Microsoft.Azure.WebPubSub.Common;
using Microsoft.Extensions.Azure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace chatapp
{
    public class Startup
    {
        public Startup(IConfiguration configuration)
        {
            Configuration = configuration;
        }

        public IConfiguration Configuration { get; }

        // This method gets called by the runtime. Use this method to add services to the container.
        // For more information on how to configure your application, visit https://go.microsoft.com/fwlink/?LinkID=398940
        public void ConfigureServices(IServiceCollection services)
        {
            services.AddWebPubSub(o => o.ServiceEndpoint = new ServiceEndpoint(Configuration["Azure:WebPubSub:ConnectionString"]))
                .AddWebPubSubServiceClient<Sample_ChatApp>();
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }

            app.UseStaticFiles();

            app.UseRouting();

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapWebPubSubHub<Sample_ChatApp>("/eventhandler/{*path}");

                endpoints.MapGet("/negotiate", async context =>
                {
                    var id = context.Request.Query["id"];
                    if (id.Count != 1)
                    {
                        context.Response.StatusCode = 400;
                        await context.Response.WriteAsync("missing user id");
                        return;
                    }
                    var serviceClient = context.RequestServices.GetRequiredService<WebPubSubServiceClient<Sample_ChatApp>>();
                    await context.Response.WriteAsync(serviceClient.GetClientAccessUri(userId: id).AbsoluteUri);
                });
            });
        }

        private sealed class Sample_ChatApp : WebPubSubHub
        {
            private readonly WebPubSubServiceClient<Sample_ChatApp> _serviceClient;

            public Sample_ChatApp(WebPubSubServiceClient<Sample_ChatApp> serviceClient)
            {
                _serviceClient = serviceClient;
            }

            public override ValueTask<ConnectEventResponse> OnConnectAsync(ConnectEventRequest request, CancellationToken cancellationToken)
            {
                // not register event will never be triggered.
                return base.OnConnectAsync(request, cancellationToken);
            }

            public override async Task OnConnectedAsync(ConnectedEventRequest request)
            {
                await _serviceClient.SendToAllAsync($"[SYSTEM] {request.ConnectionContext.UserId} joined.");
            }

            public override async ValueTask<UserEventResponse> OnMessageReceivedAsync(UserEventRequest request, CancellationToken cancellationToken)
            {
                await _serviceClient.SendToAllAsync($"[{request.ConnectionContext.UserId}] {request.Data}");

                // Advanced sample to show usage of connection state
                // Retrieve counter from ConnectionContext.ConnectionStates or init if not exists.
                var states = new CounterState(1);
                var idle = 0.0;
                if (request.ConnectionContext.ConnectionStates.TryGetValue(nameof(CounterState), out var counterValue))
                {
                    states = counterValue.ToObjectFromJson<CounterState>();
                    idle = (DateTime.Now - states.Timestamp).TotalSeconds;
                    states.Update();
                }
                // Build response .
                var response = request.CreateResponse($"[SYSTEM] ack, idle: {idle}s, connection message counter: {states.Counter}", WebPubSubDataType.Json);
                response.SetState(nameof(CounterState), BinaryData.FromObjectAsJson(states));

                return response;
            }

            // A simple class of user defined states to count message and time.
            [DataContract]
            private sealed class CounterState
            {
                [DataMember(Name = "timestamp")]
                public DateTime Timestamp { get; set; }
                [DataMember(Name = "counter")]
                public int Counter { get; set; }

                public CounterState()
                { }

                public CounterState(int counter)
                {
                    Counter = counter;
                    Timestamp = DateTime.Now;
                }

                public void Update()
                {
                    Timestamp = DateTime.Now;
                    Counter++;
                }
            }
        }
    }
}
