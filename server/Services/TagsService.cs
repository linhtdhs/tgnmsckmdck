using TgnmsckmdckApi.Models;
using TgnmsckmdckApi.Repositories;

namespace TgnmsckmdckApi.Services;

public class TagsService : ITagsService
{
    private readonly ITagRepository _tagRepo;

    public TagsService(ITagRepository tagRepo)
    {
        _tagRepo = tagRepo;
    }

    public List<Tag> GetTags()
    {
        return _tagRepo.GetTags();
    }
}
