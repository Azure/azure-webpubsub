using System.Net;
using System.Security.Cryptography.X509Certificates;
using Microsoft.Azure.WebPubSub.CloudEvents;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}


app.MapMethods("/MqttConnect",
    ["OPTIONS"], (HttpContext httpContext) =>
    {
        httpContext.Response.Headers.Append("Access-Control-Allow-Origin", "*");
        return Results.Ok();
    });
app.MapPost("/MqttConnect", async (HttpContext httpContext) =>
{
    var request = await httpContext.Request.ReadFromJsonAsync<MqttConnectEventRequest>();

    var certificates = request.ClientCertificates.Select(cert => GetCertificateFromBase64String(cert.Content));
    // Simulate Logic to validate client certificate
    if (request.Query.TryGetValue("success", out _))
    {
        // As a demo, we just accept all client certificates and grant the clients with permissions to publish and subscribe to all the topics when the query parameter "success" is present.
        await httpContext.Response.WriteAsJsonAsync(new MqttConnectEventSuccessResponse()
        {
            Roles = ["webpubsub.joinLeaveGroup", "webpubsub.sendToGroup"]
        });
    }
    else
    {
        // If you want to reject the connection, you can return a MqttConnectEventFailureResponse
        var mqttCodeForUnauthorized = request.Mqtt.ProtocolVersion switch
        {
            3 => 4, // UnAuthorized Return Code in Mqtt 3.1.1
            5 => 0x87, // UnAuthorized Reason Code in Mqtt 5.0
            _ => throw new NotSupportedException($"{request.Mqtt.ProtocolVersion} is not supported.")
        };
        httpContext.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
        await httpContext.Response.WriteAsJsonAsync(new MqttConnectEventFailureResponse(new MqttConnectEventFailureResponseProperties()
        {
            Code = mqttCodeForUnauthorized,
            Reason = "Invalid Certificate"
        }
        ));
    }
});

app.Run();

static X509Certificate2 GetCertificateFromBase64String(string certificate) => X509Certificate2.CreateFromPem(certificate);
