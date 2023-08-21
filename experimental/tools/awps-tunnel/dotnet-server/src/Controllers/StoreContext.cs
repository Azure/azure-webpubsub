using Microsoft.EntityFrameworkCore;

public class StoreContext : DbContext
{
    private readonly string _dbFile;

    public DbSet<HttpItem> HttpItems { get; set; }

    public StoreContext(string dbFile)
    {
        _dbFile = dbFile;
    }
    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
        optionsBuilder.UseSqlite("Data Source=" + _dbFile);
    }
}
