using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

using Newtonsoft.Json;

public class HttpItemRepository : IRepository<HttpDataModel>
{
    private readonly StoreContext _store;
    private readonly IHubContext<DataHub> _hubContext;
    private readonly IOutput _requestManager;

    public HttpItemRepository(StoreContext store, IHubContext<DataHub> hubContext, IOutput requestManager)
    {
        _store = store;
        _store.Database.EnsureCreated();
        _hubContext = hubContext;
        _requestManager = requestManager;
    }
    public Task<List<HttpDataModel>> GetRangeAsync(int count, CancellationToken cancellationToken)
    {
        return _store.HttpItems.OrderByDescending(s => s.Id).Take(count).ToListAsync(cancellationToken);
    }

    public Task AddAsync(HttpDataModel item, CancellationToken cancellationToken)
    {
        _store.HttpItems.Add(item);
        var dbTask = _store.SaveChangesAsync();
        var hi = new HttpItem(item);
        // do it after it is stored to DB so that ID updates
        var hubTask = _hubContext.Clients.All.SendAsync("updateData", hi, cancellationToken);
        _requestManager.AddRequest(hi);
        return Task.WhenAll(hubTask, dbTask);
    }

    public Task<List<HttpDataModel>> GetAllAsync(CancellationToken cancellationToken)
    {
        throw new NotImplementedException();
    }

    public Task UpdateAsync(HttpDataModel entity, CancellationToken cancellationToken)
    {
        throw new NotImplementedException();
    }

    public Task RemoveAsync(HttpDataModel entity, CancellationToken cancellationToken)
    {
        throw new NotImplementedException();
    }

    public Task<HttpDataModel> GetByIdAsync(int id)
    {
        throw new NotImplementedException();
    }
}

﻿public interface IRepository<TEntity> where TEntity : class	
{	
    Task<TEntity> GetByIdAsync(int id);	
    Task<List<TEntity>> GetRangeAsync(int count, CancellationToken cancellationToken);	
    Task<List<TEntity>> GetAllAsync(CancellationToken cancellationToken);	
    Task AddAsync(TEntity entity, CancellationToken cancellationToken);	
    Task UpdateAsync(TEntity entity, CancellationToken cancellationToken);	
    Task RemoveAsync(TEntity entity, CancellationToken cancellationToken);	
}

public class StoreContext : DbContext
{
    private readonly string _dbFile;

    public DbSet<HttpDataModel> HttpItems { get; set; }

    public StoreContext(string dbFile)
    {
        _dbFile = dbFile;
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.Entity<HttpDataModel>().Property(e => e.Request).HasConversion(new JsonDataConverter<HttpRequestDetail?>());
        modelBuilder.Entity<HttpDataModel>().Property(e => e.Response).HasConversion(new JsonDataConverter<HttpResponseDetail?>());
    }
    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
        optionsBuilder.UseSqlite("Data Source=" + _dbFile);
    }
}

public class JsonDataConverter<T> : ValueConverter<T, string>
{
    public JsonDataConverter() : base(
        v => JsonConvert.SerializeObject(v),
        v => string.IsNullOrEmpty(v) ? default : JsonConvert.DeserializeObject<T>(v))
    {
    }
}