using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

public class HttpItemRepository : IRepository<HttpItem>
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
    public Task<List<HttpItem>> GetRangeAsync(int count, CancellationToken cancellationToken)
    {
        return _store.HttpItems.OrderByDescending(s => s.RequestAt).Take(count).ToListAsync(cancellationToken);
    }

    public Task AddAsync(HttpItem item, CancellationToken cancellationToken)
    {
        _store.HttpItems.Add(item);
        var dbTask = _store.SaveChangesAsync();
        // do it after it is stored to DB so that ID updates
        var hubTask = _hubContext.Clients.All.SendAsync("updateData", item, cancellationToken);
        _requestManager.AddRequest(item);
        return Task.WhenAll(hubTask, dbTask);
    }

    public Task<List<HttpItem>> GetAllAsync(CancellationToken cancellationToken)
    {
        throw new NotImplementedException();
    }

    public Task UpdateAsync(HttpItem entity, CancellationToken cancellationToken)
    {
        throw new NotImplementedException();
    }

    public Task RemoveAsync(HttpItem entity, CancellationToken cancellationToken)
    {
        throw new NotImplementedException();
    }

    public Task<HttpItem> GetByIdAsync(int id)
    {
        throw new NotImplementedException();
    }
}
