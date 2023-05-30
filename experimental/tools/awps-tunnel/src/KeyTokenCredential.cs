using System.Text;

using Azure.Core;

public sealed class KeyTokenCredential : TokenCredential
{
    private static byte[] ServerIdKey = Encoding.UTF8.GetBytes("asrs.s.sn");
    private static string ServerId = $"{Environment.MachineName}_{Guid.NewGuid():N}";

    private volatile KeyBytesCache _keyCache = new KeyBytesCache(string.Empty); // it's volatile so that the cache update below is not reordered
    private readonly string _accessKey;
    private readonly int _expireAfterInMinutes;

    public KeyTokenCredential(string accessKey, int expireAfterInMinutes)
    {
        _accessKey = accessKey;
        if (expireAfterInMinutes <= 0) { throw new ArgumentOutOfRangeException(nameof(expireAfterInMinutes)); }
        _expireAfterInMinutes = expireAfterInMinutes;
    }

    public override AccessToken GetToken(TokenRequestContext requestContext, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var expiresAt = now + TimeSpan.FromMinutes(_expireAfterInMinutes);

        var key = _accessKey;
        var cache = _keyCache;
        if (!ReferenceEquals(key, cache.Key))
        {
            cache = new KeyBytesCache(key);
            _keyCache = cache;
        }

        var writer = new JwtBuilder(cache.KeyBytes);
        writer.AddClaim(JwtBuilder.Nbf, now);
        writer.AddClaim(JwtBuilder.Exp, expiresAt);
        writer.AddClaim(JwtBuilder.Iat, now);
        if (requestContext.Claims != null)
        {
            writer.AddClaim(JwtBuilder.Aud, requestContext.Claims);
        }
        writer.AddClaim(ServerIdKey, ServerId);
        return new(writer.BuildString(), expiresAt);
    }

    public override ValueTask<AccessToken> GetTokenAsync(TokenRequestContext requestContext, CancellationToken cancellationToken)
    {
        return new(GetToken(requestContext, cancellationToken));
    }

    private sealed class KeyBytesCache
    {
        public KeyBytesCache(string key)
        {
            Key = key;
            KeyBytes = Encoding.UTF8.GetBytes(key);
        }
        public readonly byte[] KeyBytes;
        public readonly string Key;
    }
}
