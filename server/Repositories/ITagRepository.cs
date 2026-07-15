using TgnmsckmdckApi.Models;

namespace TgnmsckmdckApi.Repositories;

public interface ITagRepository
{
    List<Tag> GetTags();
    Tag? AddTagToSong(int songId, string tagName);
    void RemoveTagFromSong(int songId, int tagId);
}
