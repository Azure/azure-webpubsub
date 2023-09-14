using Azure.Core;

#nullable disable
internal class TunnelServiceOptions
{
    public string Hub { get; set; }
    public int LocalPort { get; set; }
    public string LocalScheme { get; set; } = "http";
    public Uri Endpoint { get; set; }
    public TokenCredential Credential { get; set; }
}
#nullable restore