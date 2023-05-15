using System.ComponentModel.DataAnnotations.Schema;
using System.Runtime.Serialization;

using Newtonsoft.Json;

public class HttpItem
{
    public int Id { get; set; } = 0;

    public ulong? TracingId { get; set; }

    public string MethodName { get; set; } = string.Empty;

    public string Url { get; set; } = string.Empty;

    public string? Error { get; set; }

    public int? Code { get; set; }

    [IgnoreDataMember]
    [JsonIgnore]
    public DateTime RequestAt { get; set; }

    [NotMapped]
    public DateTimeOffset RequestAtOffset => new DateTimeOffset(RequestAt, TimeSpan.Zero);

    public string RequestRaw { get; set; } = string.Empty;

    [IgnoreDataMember]
    [JsonIgnore]
    public DateTime? RespondAt { get; set; }

    [NotMapped]
    public DateTimeOffset? RespondAtOffset => RespondAt == null ? null : new DateTimeOffset(RespondAt.Value, TimeSpan.Zero);

    public string ResponseRaw { get; set; } = string.Empty;
}
