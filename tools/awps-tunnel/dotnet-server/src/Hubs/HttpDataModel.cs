using System.ComponentModel.DataAnnotations.Schema;
using System.Runtime.Serialization;

using Newtonsoft.Json;

public class HttpItem
{
    public int Id => DataModel.Id;

    public ulong? TracingId => DataModel.Request.TracingId;

    public string MethodName => DataModel.Request.MethodName;

    public string Url => DataModel.Request.Url;

    public string RequestRaw => DataModel.Request.RequestRaw;

    public string? Error => DataModel.Response?.Error;

    public int? Code => DataModel.Response?.Code;

    public DateTimeOffset RequestAtOffset => new DateTimeOffset(DataModel.Request.RequestAt, TimeSpan.Zero);

    public string? ResponseRaw => DataModel.Response?.ResponseRaw;

    public DateTimeOffset? RespondAtOffset => DataModel.Response?.RespondAt == null ? null : new DateTimeOffset(DataModel.Response.RespondAt.Value, TimeSpan.Zero);

    [JsonIgnore]
    [IgnoreDataMember]
    [System.Text.Json.Serialization.JsonIgnore]
    public HttpDataModel DataModel { get; }

    public HttpItem(HttpDataModel dataModel)
    {
        DataModel = dataModel;
    }
}

public class HttpDataModel
{
    public int Id { get; set; } = 0;

    public HttpRequestDetail Request { get; set; }

    public HttpResponseDetail? Response { get; set; }
}

public class HttpRequestDetail
{
    public ulong? TracingId { get; set; }

    public string MethodName { get; set; } = string.Empty;

    public string Url { get; set; } = string.Empty;

    public string RequestRaw { get; set; } = string.Empty;

    public DateTime RequestAt { get; set; }
}

public class HttpResponseDetail
{
    public string? Error { get; set; }

    public int? Code { get; set; }

    public string ResponseRaw { get; set; } = string.Empty;

    public DateTime? RespondAt { get; set; }
}
