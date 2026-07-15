using Microsoft.AspNetCore.Mvc;
using TgnmsckmdckApi.Services;

namespace TgnmsckmdckApi.Controllers;

[ApiController]
[Route("api/tags")]
public class TagsController(ITagsService tagsService, ILogger<TagsController> logger) : ControllerBase
{
    // GET /api/tags
    [HttpGet]
    public IActionResult GetTags()
    {
        try
        {
            var tags = tagsService.GetTags();
            return Ok(tags.Select(t => new { id = t.Id, name = t.Name }));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "GetTags error");
            return StatusCode(500, new { error = "Failed to retrieve tags" });
        }
    }
}
