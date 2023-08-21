using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("[controller]")]
public class HttpHistoryController : ControllerBase
{
    private readonly ILogger<HttpHistoryController> _logger;
    private readonly IRepository<HttpItem> _repo;

    public HttpHistoryController(ILogger<HttpHistoryController> logger, IRepository<HttpItem> repo)
    {
        _logger = logger;
        _repo = repo;
    }

    [HttpGet]
    public Task<List<HttpItem>> GetAsync(CancellationToken token)
    {
        return _repo.GetRangeAsync(50, token);
    }
}
