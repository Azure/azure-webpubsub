using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

using Azure.Messaging.WebPubSub;

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Azure.WebPubSub.AspNetCore;
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
            services.AddWebPubSub(o => o.ValidationOptions.Add(Configuration["Azure:WebPubSub:ConnectionString"]))
                .AddAzureClients(builder =>
                {
                    builder.AddWebPubSubServiceClient(Configuration["Azure:WebPubSub:ConnectionString"], nameof(SampleChatHub));
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
                endpoints.MapWebPubSubHub<SampleChatHub>("/eventhandler/{event}");

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
            });
        }
    }
}
