using Microsoft.Data.Sqlite;

namespace TgnmsckmdckApi.Repositories;

public interface IMasterRepository
{
    SqliteConnection CreateConnection();

    string GetMediaDir();
}