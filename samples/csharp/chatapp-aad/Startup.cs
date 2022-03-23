using System;
using System.IO;

using Azure.Identity;
using Azure.Messaging.WebPubSub;

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
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
        
        public void ConfigureServices(IServiceCollection services)
        {
            services.AddAzureClients(builder =>
            {
                var credential = new DefaultAzureCredential();
                builder.AddWebPubSubServiceClient(new Uri(Configuration["Azure:WebPubSub:Endpoint"]), "AwpsSampleAadChatApp", credential);
            });
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
                endpoints.MapGet("/negotiate", async context =>
                {
                    var id = context.Request.Query["id"];
                    if (id.Count != 1)
                    {
                        context.Response.StatusCode = 400;
                        await context.Response.WriteAsync("missing user id");
                        return;
                    }
                    var serviceClient = context.RequestServices.GetRequiredService<WebPubSubServiceClient>();
                    await context.Response.WriteAsync(serviceClient.GetClientAccessUri(userId: id).AbsoluteUri);
                });

                endpoints.Map("/eventhandler/{*path}", async context =>
                {
                    var serviceClient = context.RequestServices.GetRequiredService<WebPubSubServiceClient>();
                    // abuse protection
                    if (context.Request.Method == "OPTIONS")
                    {
                        if (context.Request.Headers["WebHook-Request-Origin"].Count > 0)
                        {
                            context.Response.Headers["WebHook-Allowed-Origin"] = "*";
                            context.Response.StatusCode = 200;
                            return;
                        }
                    }
                    else if (context.Request.Method == "POST")
                    {
                        // get the userId from header
                        var userId = context.Request.Headers["ce-userId"];
                        if (context.Request.Headers["ce-type"] == "azure.webpubsub.sys.connected")
                        {
                            // the connected event
                            Console.WriteLine($"{userId} connected");
                            context.Response.StatusCode = 200; await serviceClient.SendToAllAsync($"[SYSTEM] {userId} joined.");
                            return;
                        }
                        else if (context.Request.Headers["ce-type"] == "azure.webpubsub.user.message")
                        {
                            using var stream = new StreamReader(context.Request.Body);
                            await serviceClient.SendToAllAsync($"[{userId}] {await stream.ReadToEndAsync()}");
                            context.Response.StatusCode = 200;
                            return;
                        }
                    }
                });
            });
        }
    }
}
