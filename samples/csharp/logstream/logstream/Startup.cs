using Azure.Messaging.WebPubSub;

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Azure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace logstream
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
                builder.AddWebPubSubServiceClient(Configuration["Azure:WebPubSub:ConnectionString"], "awpssamplestream");
            });
        }

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
                    var serviceClient = context.RequestServices.GetRequiredService<WebPubSubServiceClient>();
                    var response = new
                    {
                        url = serviceClient.GetClientAccessUri(roles: new string[] { "webpubsub.sendToGroup.stream", "webpubsub.joinLeaveGroup.stream" }).AbsoluteUri
                    };
                    await context.Response.WriteAsJsonAsync(response);
                });
            });
        }
    }
}
